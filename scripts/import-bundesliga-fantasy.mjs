// Imports the user's Bundesliga Fantasy Manager exports into the shape the
// other fantasy leagues use (scripts/fetch-fantasy-players.mjs), so the
// shared fantasy tab shows them: src/data/bundesligaPlayers.json and the
// season archive src/data/bundesligaHistory.json.
//
// The game is app-only with no public feed. A separate tool (the user's
// falcon-fighting-fantasy repo) reads the app on their phone and writes CSVs,
// one folder per run: <exports>/YYYY-MM-DD/ (players, player_rounds,
// my_team, my_team_info, my_rounds, my_team_rounds, run_info) and
// <exports>/rules.csv. No login or credential passes through here.
//
// Folders are read oldest first and a newer one wins for the same player and
// matchday (points can be corrected until noon the day after a matchday).
// Weekly runs export only the newest matchday, so matchdays are merged
// across folders. Fixtures and results come from ESPN ('ger.1'), and the
// same extras as the other leagues from scripts/lib/fantasyEnrich.mjs:
// penalties from ESPN, absences and ban risk from Transfermarkt.
//
// Usage: npm run bundesliga:import [-- <exports/bundesliga folder>]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getJson, norm, fetchEspnEvents, fetchPenalties, matchPlayer, fetchTransfermarkt } from './lib/fantasyEnrich.mjs'

const DEFAULT_DIR = '/home/henry/IdeaProjects/falcon-fighting-fantasy/exports/bundesliga'
const DIR = process.argv[2] ?? process.env.BUNDESLIGA_EXPORTS ?? DEFAULT_DIR
const data = name => fileURLToPath(new URL(`../src/data/${name}.json`, import.meta.url))
const OUT = data('bundesligaPlayers')
const HISTORY_OUT = data('bundesligaHistory')
const ESPN_SLUG = 'ger.1'
const TRANSFERMARKT_PATH = 'bundesliga/{page}/wettbewerb/L1'
// August to May, named like the game's "2026/27".
const SEASON = { start: 8, months: 10 }
const LOG = 'bundesliga import:'

// ── CSV ──────────────────────────────────────────────────────────────────
// Quoted fields may hold commas, quotes ("") and newlines.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [header, ...body] = rows.filter(r => r.some(v => v !== ''))
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, ''), r[i] ?? ''])))
}

const readCsv = (folder, file) => {
  const path = join(folder, file)
  return existsSync(path) ? parseCsv(readFileSync(path, 'utf8')) : null
}
// Empty means the app doesn't show it: null, never 0.
const num = v => (v === '' || v == null ? null : Number(v))
const bool = v => v === 'true'

// ── Rules ────────────────────────────────────────────────────────────────
// Read from the game's own rules text where it states them; defaults are
// the 2026/27 rules.
function readRules(rows) {
  const note = action => rows?.find(r => r.action === action)?.note ?? ''
  const squad = note('Squad and budget')
  const range = (pos, fallback) => {
    const m = squad.match(new RegExp(`(\\d+) to (\\d+) ${pos}`))
    return m ? [Number(m[1]), Number(m[2])] : fallback
  }
  return {
    squadTeamLimit: Number(note('Club limit').match(/maximum of (\d+)/)?.[1] ?? 3),
    budget: Number(squad.match(/total value of (\d+) million/)?.[1] ?? 150),
    // Players sell at their market value: no sell-on fee.
    sellOnFee: 0,
    maxFreeTransfers: Number(note('Transfers').match(/you have (\d+) transfers/)?.[1] ?? 5),
    // Transfers past the allowance aren't possible at all, so no points hits.
    transferHits: false,
    chips: [],
    // 3 star players (one DEF, one MID, one FWD) score 1.5×, instead of a captain.
    captaincy: 'stars',
    // Squad: 2 GK, 4–6 DEF, 4–6 MID, 2–4 FWD; outfield transfers can change position.
    squadShape: { 1: [2, 2], 2: range('defenders', [4, 6]), 3: range('midfielders', [4, 6]), 4: range('forwards', [2, 4]) },
    // Transfers are unlimited before the matchday after each of these.
    unlimitedTransfersAfter: [...note('Breaks with unlimited transfers').matchAll(/between Matchdays (\d+) and \d+/g)].map(m => Number(m[1])),
  }
}

// ── Clubs ────────────────────────────────────────────────────────────────
// The app's club names ("FC Bayern München") → ESPN's teams ("Bayern Munich"),
// by their distinctive words, with the English spellings ESPN uses.
const ENGLISH = { koln: 'cologne', munchen: 'munich', hamburger: 'hamburg' }
const COMMON = new Set(['fc', 'sv', 'sc', 'tsg', 'vfb', 'rb', 'bayer', 'borussia', '1', 'fsv', 'eintracht', '04', '05', '07', 'werder'])
const words = name => norm(name).split(/[ .-]+/).map(w => ENGLISH[w] ?? w).filter(w => w && !COMMON.has(w))

function matchClubs(clubNames, espnTeams) {
  const byClub = new Map()
  for (const club of clubNames) {
    const mine = words(club)
    const scored = espnTeams.map(t => ({ t, hits: mine.filter(w => words(t.displayName).includes(w)).length }))
      .sort((a, b) => b.hits - a.hits)
    if (!scored[0]?.hits || scored[1]?.hits === scored[0].hits) throw new Error(`can't match club "${club}" to an ESPN team`)
    byClub.set(club, scored[0].t)
  }
  return byClub
}

// ── Fixtures ─────────────────────────────────────────────────────────────
// ESPN has no matchday number. The export's own matches ("Home vs Away, …")
// give each played fixture its matchday; the rest go in the earliest
// matchday neither club has played yet, as groupByTeamRounds does for the
// Europe tab (src/utils/leaguePhase.js).
function buildFixtures(events, clubByEspnId, knownRounds) {
  const fixtures = events.map(e => {
    const cs = e.competitions?.[0]?.competitors ?? []
    const home = cs.find(c => c.homeAway === 'home')
    const away = cs.find(c => c.homeAway === 'away')
    const done = e.status?.type?.completed
    return {
      id: Number(e.id),
      kickoff: new Date(e.date).toISOString(),
      home: Number(home?.team?.id),
      away: Number(away?.team?.id),
      homeScore: done ? Number(home.score) : null,
      awayScore: done ? Number(away.score) : null,
    }
  }).filter(f => clubByEspnId.has(f.home) && clubByEspnId.has(f.away))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  const used = new Map()
  const usedBy = id => used.get(id) ?? used.set(id, new Set()).get(id)
  // Rounds the export names first, so the others fill the gaps around them.
  for (const f of fixtures) {
    const round = knownRounds.get(`${f.home}-${f.away}`)
    if (round) { f.round = round; usedBy(f.home).add(round); usedBy(f.away).add(round) }
  }
  for (const f of fixtures.filter(x => !x.round)) {
    let round = 1
    while (usedBy(f.home).has(round) || usedBy(f.away).has(round)) round++
    f.round = round
    usedBy(f.home).add(round); usedBy(f.away).add(round)
  }
  return fixtures.map(({ id, round, kickoff, home, away, homeScore, awayScore }) => ({ id, round, kickoff, home, away, homeScore, awayScore }))
}

// ── Merge the dated folders ──────────────────────────────────────────────
function readExports() {
  const folders = readdirSync(DIR).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort()
  if (!folders.length) throw new Error(`no dated export folders in ${DIR}`)
  const players = new Map()
  const rounds = new Map()
  const actions = new Map()
  const myRounds = new Map()
  const lineups = new Map()
  let myTeam = null
  let info = null
  let run = null
  for (const name of folders) {
    const folder = join(DIR, name)
    for (const p of readCsv(folder, 'players.csv') ?? []) {
      // A row the run hadn't read in detail only carries name, club,
      // position, price and totals: keep earlier details.
      const before = players.get(p.player_key) ?? {}
      const merged = { ...before }
      for (const [k, v] of Object.entries(p)) if (v !== '') merged[k] = v
      merged.everRead = before.everRead || p.details_read === 'true'
      players.set(p.player_key, merged)
    }
    for (const r of readCsv(folder, 'player_rounds.csv') ?? []) rounds.set(`${r.player_key}|${r.round}`, r)
    // A player's matchday breakdown is replaced whole by a newer folder's.
    const fresh = new Map()
    for (const r of readCsv(folder, 'player_actions.csv') ?? []) {
      const key = `${r.player_key}|${r.round}`
      if (!fresh.has(key)) fresh.set(key, [])
      fresh.get(key).push(r)
    }
    for (const [key, rows] of fresh) actions.set(key, rows)
    for (const r of readCsv(folder, 'my_rounds.csv') ?? []) {
      const before = myRounds.get(r.round) ?? {}
      // Overall rank is only known for each run's newest matchday: keep it.
      myRounds.set(r.round, { ...r, overall_rank: r.overall_rank || before.overall_rank || '' })
    }
    const lineupRows = readCsv(folder, 'my_team_rounds.csv') ?? []
    for (const round of new Set(lineupRows.map(r => r.round))) lineups.set(round, lineupRows.filter(r => r.round === round))
    myTeam = readCsv(folder, 'my_team.csv') ?? myTeam
    info = readCsv(folder, 'my_team_info.csv')?.[0] ?? info
    run = { ...(readCsv(folder, 'run_info.csv')?.[0] ?? {}), folder: name }
  }
  return { folders, players, rounds, actions, myRounds, lineups, myTeam, info, run }
}

// ── History archive (as the other leagues keep it) ───────────────────────
function writeHistory(season, myRounds, lineups, info) {
  let archive
  try {
    archive = JSON.parse(readFileSync(HISTORY_OUT, 'utf8'))
  } catch {
    archive = { note: 'The user\'s Bundesliga Fantasy seasons, imported from the app exports by scripts/import-bundesliga-fantasy.mjs; matchdays are kept once imported.', seasons: [], rounds: {} }
  }
  const kept = new Map((archive.rounds[season] ?? []).map(r => [r.round, r]))
  let total = 0
  const rows = [...myRounds.values()].sort((a, b) => a.round - b.round).map(r => {
    total += Number(r.points)
    const old = kept.get(Number(r.round)) ?? {}
    const bench = (lineups.get(r.round) ?? []).filter(p => p.on_bench === 'true').reduce((s, p) => s + Number(p.points || 0), 0)
    return {
      round: Number(r.round),
      points: Number(r.points),
      total,
      rank: num(r.matchday_rank),
      overallRank: num(r.overall_rank) ?? old.overallRank ?? null,
      hits: 0,
      bench,
    }
  })
  for (const [round, row] of kept) if (!rows.some(r => r.round === round)) rows.push(row)
  rows.sort((a, b) => a.round - b.round)
  archive.generatedAt = new Date().toISOString()
  archive.seasons = [...archive.seasons.filter(s => s.season !== season), { season, points: Number(info.total_points), rank: num(info.rank), live: true }]
    .sort((a, b) => a.season.localeCompare(b.season))
  archive.rounds[season] = rows
  const lines = list => list.map(r => `      ${JSON.stringify(r)}`).join(',\n')
  const roundsJson = Object.entries(archive.rounds).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => `    ${JSON.stringify(key)}: [\n${lines(list)}\n    ]`).join(',\n')
  writeFileSync(HISTORY_OUT, `{
  "generatedAt": ${JSON.stringify(archive.generatedAt)},
  "note": ${JSON.stringify(archive.note)},
  "seasons": [\n${archive.seasons.map(r => `    ${JSON.stringify(r)}`).join(',\n')}\n  ],
  "rounds": {\n${roundsJson}\n  }
}\n`)
  return rows.length
}

const POSITION = { GK: 1, DEF: 2, MID: 3, FWD: 4 }
const STATUS = { fit: 'a', doubtful: 'd', injured: 'i', suspended: 's', unavailable: 'u' }
// Notes about a player's last match that the export tool doesn't know as a
// status: they say nothing about fitness (the player stays available), so
// they're left out of the warnings the tab shows.
const LINEUP_NOTES = /^unknown status text for .*: "(Player was substituted in|Not in starting lineup|Player was substituted off)"$/

const exportWarnings = text => (text || '').split(' | ').map(w => w.trim()).filter(w => w && !LINEUP_NOTES.test(w)).join(' | ') || null

try {
  const ex = readExports()
  const rules = readRules(readCsv(DIR, 'rules.csv'))
  const now = new Date()
  const seasonYear = now.getMonth() + 1 >= SEASON.start ? now.getFullYear() : now.getFullYear() - 1
  const season = `${seasonYear}/${String((seasonYear + 1) % 100).padStart(2, '0')}`

  // Clubs, as ESPN's teams.
  const espnTeams = (await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_SLUG}/teams`)).sports[0].leagues[0].teams.map(t => t.team)
  const clubs = matchClubs([...new Set([...ex.players.values()].map(p => p.club))], espnTeams)
  const teamId = club => Number(clubs.get(club).id)
  const clubByEspnId = new Map([...clubs].map(([club, t]) => [Number(t.id), club]))

  // Matchdays the export knows, from each played match's text.
  const knownRounds = new Map()
  for (const r of ex.rounds.values()) {
    const m = r.match?.match(/^(.+?) vs (.+?), /)
    if (m && clubs.has(m[1]) && clubs.has(m[2])) knownRounds.set(`${teamId(m[1])}-${teamId(m[2])}`, Number(r.round))
  }
  const events = await fetchEspnEvents(ESPN_SLUG, seasonYear, SEASON)
  const fixtures = buildFixtures(events, clubByEspnId, knownRounds)

  // Finished matchdays: the newest the export has scored.
  const lastRound = Math.max(Number(ex.run.round) || 0, ...[...ex.myRounds.keys()].map(Number))
  const roundList = Array.from({ length: lastRound }, (_, i) => i + 1)

  // Name-matching for ESPN and Transfermarkt, in the shape matchPlayer reads.
  const elements = [...ex.players.values()].map(p => {
    const [first, ...rest] = p.name.split(' ')
    return { id: p.player_key, first_name: rest.length ? first : '', second_name: rest.length ? rest.join(' ') : first, web_name: p.name, team: teamId(p.club) }
  })
  const teamNames = Object.fromEntries([...clubs].map(([, t]) => [Number(t.id), t.displayName]))

  let penaltiesById = new Map()
  let penaltyNote
  try {
    const { matches, penalties } = await fetchPenalties(ESPN_SLUG, events)
    const unmatched = new Set()
    for (const pen of penalties) {
      const player = matchPlayer(pen.name, elements, teamNames)
      if (!player) { unmatched.add(pen.name); continue }
      const p = penaltiesById.get(player.id) ?? { taken: 0, scored: 0, last: null }
      p.taken++
      if (pen.scored) p.scored++
      if (pen.date && (!p.last || pen.date > p.last)) p.last = pen.date
      penaltiesById.set(player.id, p)
    }
    penaltyNote = `${penalties.length} penalties in ${matches} matches${unmatched.size ? ` (no fantasy player for ${[...unmatched].join(', ')})` : ''}`
  } catch (err) {
    penaltyNote = `ESPN penalties failed (${err.message})`
  }

  let absenceById = new Map()
  let yellowsById = new Map()
  let transfermarktNote
  try {
    const { absences, yellows } = await fetchTransfermarkt(TRANSFERMARKT_PATH)
    const unmatched = []
    const byId = (rows, value) => new Map(rows.flatMap(row => {
      const player = matchPlayer(row.name, elements, teamNames, row.club)
      if (!player) { unmatched.push(row.name); return [] }
      return [[player.id, value(row)]]
    }))
    absenceById = byId(absences, ({ type, reason, until }) => ({ type, reason, until }))
    yellowsById = byId(yellows, row => row.cards)
    transfermarktNote = `${absenceById.size} out and ${yellowsById.size} at risk of a ban${unmatched.length ? ` (no fantasy player for ${unmatched.join(', ')})` : ''}`
  } catch (err) {
    transfermarktNote = `Transfermarkt failed (${err.message})`
  }

  // Every scoring action the exports name, each in a group: playing time,
  // returns (goals, assists and the team's goals, clean sheets and goals
  // conceded: rare or not the player's own doing) and underlying (the
  // repeatable rest: duels, passes, recoveries, shots, saves, fouls…).
  const actionTypes = []
  const actionIndex = new Map()
  const groupOf = (category, action) => {
    if (action === 'Playing time') return 'minutes'
    if (category === 'Goals & Assists' || category === 'Playing Time & Team' || action === 'Penalty saved') return 'returns'
    return 'underlying'
  }
  const typeOf = r => {
    if (!actionIndex.has(r.action)) {
      actionIndex.set(r.action, actionTypes.length)
      actionTypes.push({ name: r.action, category: r.category, group: groupOf(r.category, r.action) })
    }
    return actionIndex.get(r.action)
  }

  let unread = 0
  const players = [...ex.players.values()].map(p => {
    const read = p.everRead
    if (!read) unread++
    // Read players without a row for a matchday didn't play it; unread ones are unknown.
    const perRound = field => roundList.map(r => {
      const row = ex.rounds.get(`${p.player_key}|${r}`)
      return row ? num(row[field]) ?? 0 : read ? 0 : null
    })
    const [first, ...rest] = p.name.split(' ')
    return {
      id: p.player_key,
      name: p.name,
      fullName: p.name,
      shortName: rest.length ? rest.join(' ') : first,
      team: teamId(p.club),
      position: POSITION[p.position],
      price: num(p.price),
      ownership: num(p.ownership_pct),
      status: STATUS[p.status] ?? 'a',
      chance: p.status === 'doubtful' ? 50 : null,
      news: p.status_note || null,
      penalties: penaltiesById.get(p.player_key) ?? null,
      absence: absenceById.get(p.player_key) ?? null,
      yellowCards: yellowsById.get(p.player_key) ?? null,
      goals: num(p.goals),
      assists: num(p.assists),
      // The season total and average the app shows, for players whose
      // matchdays the export hasn't read yet (withForm falls back to them).
      totalPoints: num(p.total_points),
      avgPoints: num(p.avg_points),
      points: perRound('points'),
      minutes: perRound('minutes'),
      // Per matchday, [actionType, count, points] for each scoring action
      // (they add up to the matchday's points); [] for a matchday not played,
      // null where the export hasn't broken it down.
      actions: roundList.map(r => {
        const rows = ex.actions.get(`${p.player_key}|${r}`)
        if (rows) return rows.map(a => [typeOf(a), num(a.count) ?? 0, num(a.points) ?? 0])
        const row = ex.rounds.get(`${p.player_key}|${r}`)
        return (row ? !num(row.points) && !num(row.minutes) : read) ? [] : null
      }),
    }
  })

  // How this game's points compare with the Premier League platform's (a
  // regular there averages about 3 a round): the planner's explanations judge
  // form gaps in these units.
  const averages = players.map(p => p.avgPoints).filter(v => v > 0).sort((a, b) => a - b)
  rules.pointsScale = averages.length ? Math.max(1, Math.round(averages[Math.floor(averages.length / 2)] / 3)) : 1

  const info = ex.info
  const round = Number(info.round)
  const mySquad = {
    entryId: null,
    name: info.team_name,
    round,
    rank: num(info.rank),
    total: num(info.total_points),
    bank: num(info.bank),
    freeTransfers: num(info.free_transfers) ?? rules.maxFreeTransfers,
    // No points hits: transfers past the allowance aren't allowed.
    transferCost: 0,
    // The break before the next matchday allows unlimited transfers.
    unlimitedTransfers: rules.unlimitedTransfersAfter.includes(round),
    teamValue: num(info.team_value),
    formation: info.formation?.replace(/\s/g, '') || null,
    chipsUsed: [],
    points: Object.fromEntries([...ex.myRounds.values()].map(r => [r.round, Number(r.points)])),
    picks: ex.myTeam.map(t => ({
      id: t.player_key,
      captain: false,
      vice: false,
      star: bool(t.is_star_player),
      bench: bool(t.on_bench),
      // The app doesn't show what was paid; the planner sells at market value.
      purchasePrice: num(t.purchase_price),
    })),
  }

  const historyRounds = writeHistory(season, ex.myRounds, ex.lineups, info)
  // Short names for the tables ("Bayern", "Gladbach"), as the other leagues'
  // feeds give; the app's full club name stays as fullName.
  const SHORT = { Cologne: 'Köln' }
  const teamRows = [...clubs].map(([club, t]) => ({ id: Number(t.id), name: SHORT[t.shortDisplayName] ?? t.shortDisplayName ?? club, fullName: club, short: t.abbreviation }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const lines = rows => rows.map(r => `    ${JSON.stringify(r)}`).join(',\n')
  const json = `{
  "generatedAt": ${JSON.stringify(new Date().toISOString())},
  "source": ${JSON.stringify({ exportedAt: ex.run.exported_at || null, folders: ex.folders, warnings: exportWarnings(ex.run.warnings), unread })},
  "rounds": ${JSON.stringify(roundList)},
  "rules": ${JSON.stringify(rules)},
  "actionTypes": [\n${lines(actionTypes)}\n  ],
  "mySquad": ${JSON.stringify(mySquad)},
  "topManagers": null,
  "teams": [\n${lines(teamRows)}\n  ],
  "fixtures": [\n${lines(fixtures)}\n  ],
  "players": [\n${lines(players)}\n  ]
}`
  writeFileSync(OUT, json + '\n')
  const mismatched = [...knownRounds].filter(([pair, r]) => fixtures.find(f => `${f.home}-${f.away}` === pair)?.round !== r).length
  console.log(`${LOG} ${players.length} players (${unread} not read in detail yet), ${teamRows.length} clubs, through matchday ${lastRound} from ${ex.folders.length} export folder(s); ${fixtures.length} fixtures${mismatched ? ` (${mismatched} disagree with the export's matchdays)` : ''}; ${penaltyNote}; ${transfermarktNote}; history: ${historyRounds} matchdays of ${season}${exportWarnings(ex.run.warnings) ? `; export warnings: ${exportWarnings(ex.run.warnings)}` : ''}`)
} catch (err) {
  console.log(`${LOG} failed (${err.message}); keeping the existing ${OUT}`)
  process.exitCode = 1
}
