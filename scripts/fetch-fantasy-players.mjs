// Fetches every player's points and minutes for each finished round of a
// fantasy game on the Premier League's platform (Eliteserien, Allsvenskan)
// and writes them to src/data/<league>Players.json, which that league's
// fantasy tab imports. Also adds who has taken penalties this season (from
// ESPN match events), injuries, suspensions and yellow-card risk (from
// Transfermarkt), every fixture, the user's own squad and the overall top
// 50's squads. A second, small file, src/data/<league>Rounds.json, maps ESPN
// match ids to fantasy rounds for the Europe tab, and the user's season
// archive is kept in src/data/<league>History.json. None of these sources
// allow cross-origin reads, so this runs at deploy time instead of in the
// browser.
//
// Rounds are fantasy events (1–30), which is how the game numbers them even
// when a league round is postponed and played out of order.
//
// Usage: node scripts/fetch-fantasy-players.mjs <eliteserien|allsvenskan>
// On failure the existing JSON is left untouched and the script exits 0, so
// an outage never blocks a deploy. If only ESPN, Transfermarkt or a squad
// fetch fails, that part is carried over from the existing JSON.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { matchTeamsByKickoff } from './lib/matchTeamsByKickoff.mjs'

// Per league: the game's API, ESPN's league slug, Transfermarkt's league
// path and code, the user's team and the game's overall league (one standings
// page of it is the top 50).
//
// `entryId` is the number in the user's team URL,
// <game site>/entry/<id>/history. A new season gives a new id, so update it
// here (or set <LEAGUE>_ENTRY_ID, e.g. ALLSVENSKAN_ENTRY_ID) when the next
// season starts.
const LEAGUES = {
  eliteserien: { api: 'https://fantasy.eliteserien.no/api', espn: 'nor.1', transfermarkt: 'eliteserien/{page}/wettbewerb/NO1', entryId: 10837, overallLeague: 329 },
  allsvenskan: { api: 'https://fantasy.allsvenskan.se/api', espn: 'swe.1', transfermarkt: 'allsvenskan/{page}/wettbewerb/SE1', entryId: 13063, overallLeague: 315 },
}
const LEAGUE = process.argv[2]
if (!LEAGUES[LEAGUE]) {
  console.log(`usage: node scripts/fetch-fantasy-players.mjs <${Object.keys(LEAGUES).join('|')}>`)
  process.exit(0)
}
const CONFIG = LEAGUES[LEAGUE]
const data = file => fileURLToPath(new URL(`../src/data/${LEAGUE}${file}.json`, import.meta.url))
const OUT = data('Players')
const ROUNDS_OUT = data('Rounds')
const HISTORY_OUT = data('History')
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36' }
const API = CONFIG.api
const ESPN = `https://site.api.espn.com/apis/site/v2/sports/soccer/${CONFIG.espn}`
// transfermarkt.com doesn't answer scripted requests; the .co.in mirror does.
const TRANSFERMARKT = 'https://www.transfermarkt.co.in'
const MY_ENTRY_ID = Number(process.env[`${LEAGUE.toUpperCase()}_ENTRY_ID`]) || CONFIG.entryId
const OVERALL_LEAGUE_ID = CONFIG.overallLeague
const LOG = `${LEAGUE} players:`

async function get(url, headers = HEADERS) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res
}

const getJson = url => get(url).then(res => res.json())

function readExisting() {
  try { return JSON.parse(readFileSync(OUT, 'utf8')) } catch { return null }
}

// "Bodø/Glimt" and "Bodo/Glimt", "Sørensen" and "Sorensen", "Malmö" and "Malmo" compare equal.
function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ł/g, 'l').replace(/đ/g, 'd')
    .replace(/[.,]/g, '').replace(/ (jr|sr)$/, '').replace(/\s+/g, ' ').trim()
}

async function mapLimit(items, limit, fn) {
  const out = []
  for (let i = 0; i < items.length; i += limit) out.push(...await Promise.all(items.slice(i, i + limit).map(fn)))
  return out
}

// This season's league matches. Both leagues run March–December inside one
// calendar year; ESPN ignores date ranges, so one scoreboard request per
// month (see src/api/espnDates.js).
async function fetchEspnEvents() {
  const year = new Date().getUTCFullYear()
  const months = Array.from({ length: 10 }, (_, i) => `${year}${String(i + 3).padStart(2, '0')}`)
  const pages = await Promise.all(months.map(m => getJson(`${ESPN}/scoreboard?dates=${m}&limit=300`).then(d => d.events ?? [])))
  const seen = new Set()
  return pages.flat().filter(e => e?.id && !seen.has(e.id) && seen.add(e.id))
}

// ESPN match id → fantasy round. Each home/away pairing happens once a
// season, so it identifies a match wherever it's rescheduled to.
function espnRounds(espnEvents, fixtures) {
  const espnFixtures = espnEvents.map(e => {
    const cs = e.competitions?.[0]?.competitors ?? []
    return {
      id: e.id,
      kickoff: new Date(e.date).toISOString(),
      home: cs.find(c => c.homeAway === 'home')?.team?.id,
      away: cs.find(c => c.homeAway === 'away')?.team?.id,
    }
  }).filter(f => f.home && f.away)
  // The game's team list has more clubs than the league, so count from fixtures.
  const teamCount = new Set(fixtures.map(f => f.home)).size
  const teams = matchTeamsByKickoff(fixtures, espnFixtures)
  if (teams.size !== teamCount) throw new Error(`matched ${teams.size} of ${teamCount} teams`)
  const espnByPair = new Map(espnFixtures.map(f => [`${f.home}-${f.away}`, f.id]))
  const rounds = {}
  for (const f of fixtures) {
    const id = espnByPair.get(`${teams.get(f.home)}-${teams.get(f.away)}`)
    if (!id) throw new Error(`no ESPN match for fantasy fixture ${f.home} v ${f.away}`)
    // A postponed match with no new date has no round until the game gives it one.
    if (f.round != null) rounds[id] = f.round
  }
  return rounds
}

// Every penalty in this season's finished league matches.
async function fetchPenalties(espnEvents) {
  const ids = espnEvents.filter(e => e.status?.type?.completed).map(e => e.id)
  const summaries = await mapLimit(ids, 8, id => getJson(`${ESPN}/summary?event=${id}`))
  const penalties = []
  summaries.forEach((s, i) => {
    for (const k of s.keyEvents ?? []) {
      const type = k.type?.type ?? ''
      const name = k.participants?.[0]?.athlete?.displayName
      // A saved penalty names the goalkeeper; the taker gets his own "missed" event.
      if (!type.startsWith('penalty---') || type === 'penalty---saved' || !name) continue
      penalties.push({ name, scored: type === 'penalty---scored', date: s.header?.competitions?.[0]?.date ?? null, match: ids[i] })
    }
  })
  return { matches: ids.length, penalties }
}

const firstWord = s => s.split(/[ -]/)[0]
const lastWord = s => s.split(/[ -]/).at(-1)

// ESPN and Transfermarkt name players in full, with or without middle names
// ("Bilal Njie" for "Bilal Elmi Njie", "Ousmane Diallo" for "Ousmane Diallo
// Toure"), so fall back to first given name + any surname word. clubName
// breaks a tie between namesakes.
function matchPlayer(name, elements, teamNames, clubName) {
  const key = norm(name)
  const full = e => norm(`${e.first_name} ${e.second_name}`)
  const pick = candidates => {
    if (candidates.length <= 1 || !clubName) return candidates.length === 1 ? candidates[0] : null
    const club = norm(clubName)
    const sameClub = candidates.filter(e => club.includes(norm(teamNames[e.team])))
    return sameClub.length === 1 ? sameClub[0] : null
  }
  const exact = elements.filter(e => [full(e), norm(`${firstWord(e.first_name)} ${e.second_name}`), norm(e.web_name)].includes(key))
  if (exact.length) return pick(exact)
  const named = elements.filter(e =>
    firstWord(norm(e.first_name)) === firstWord(key) && norm(e.second_name).split(/[ -]/).includes(lastWord(key)))
  if (named.length) return pick(named)
  // Spelling differs in the given name ("Nikolas"/"Nicolas"): a surname unique in the league.
  return pick(elements.filter(e => lastWord(norm(e.second_name)) === lastWord(key)))
}

// Transfermarkt list pages: one <table class="items"> per list, one row per
// player. Cells (unfiltered) are [_, name, position, _, _, value, value…];
// the second title attribute after the player's is his club.
//
// Tables are found by the heading before them, not their order: a list with
// nothing in it ("No information available") has no table at all, which
// shifts every table after it.
function transfermarktTables(html, headings) {
  const text = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  const parts = html.split('class="items"')
  const found = {}
  parts.slice(1).forEach((table, i) => {
    const before = text(parts[i].slice(-3000))
    const heading = headings
      .map(h => ({ h, at: before.lastIndexOf(h) }))
      .filter(x => x.at !== -1)
      .sort((a, b) => b.at - a.at)[0]?.h
    if (!heading || found[heading]) return
    found[heading] = table.split(/<tr class="(?:odd|even)">/).slice(1).map(row => ({
      cells: row.split('</td>').map(text),
      club: [...row.matchAll(/title="([^"]+)"/g)].map(m => m[1])[2] ?? null,
    }))
  })
  return found
}

// "01/03/2027" (day first) → "2027-03-01"; blank when the return is unknown.
function tmDate(s) {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

async function fetchTransfermarkt() {
  const headers = { ...HEADERS, 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'en-GB,en;q=0.9' }
  const page = path => get(`${TRANSFERMARKT}/${CONFIG.transfermarkt.replace('{page}', path)}`, headers).then(res => res.text())
  const [injuredHtml, suspendedHtml] = await Promise.all([page('verletztespieler'), page('sperrenausfaelle')])
  const { 'injured players': injured = [] } = transfermarktTables(injuredHtml, ['injured players'])
  // Suspensions and other absences, and players one booking from a ban.
  const { Suspensions: suspended = [], 'Risk of suspension': yellows = [] } =
    transfermarktTables(suspendedHtml, ['Suspensions', 'Risk of suspension'])
  if (!injured.length && !suspended.length && !yellows.length) throw new Error('no rows; the page layout may have changed')
  return {
    absences: [
      ...injured.map(({ cells, club }) => ({ name: cells[1], club, type: 'injury', reason: cells[5], until: tmDate(cells[6]) })),
      ...suspended.map(({ cells, club }) => ({ name: cells[1], club, type: 'suspension', reason: cells[5], until: tmDate(cells[6]) })),
    ],
    yellows: yellows.map(({ cells, club }) => ({ name: cells[1], club, cards: Number(cells[5]) })),
  }
}

// The game marks chips that make a round's transfers free as `transfer`.
// Every one but the wildcard is a one-round squad that reverts (rich uncle,
// Allsvenskan's uteam); their transfers are still listed.
function chipKinds(chips) {
  const transfer = new Set(chips.filter(c => c.chip_type === 'transfer').map(c => c.name))
  return { transfer, reverting: new Set([...transfer].filter(name => name !== 'wildcard')) }
}

// Free transfers for the round after `history`'s last, replayed from round 2
// (round 1's squad is picked, not transferred): one more each round, up to
// `max` banked. A wildcard or rich uncle round uses none and adds none. The
// game doesn't publish the count, so the replay is checked against the hits
// actually paid (4 points per transfer over the free ones); `mismatches`
// lists rounds where it disagrees.
const HIT = 4
function freeTransfers(history, chipRounds, max) {
  let free = 1
  const mismatches = []
  for (const r of history) {
    if (r.event < 2 || chipRounds.has(r.event)) continue
    if (Math.max(0, r.event_transfers - free) * HIT !== r.event_transfers_cost) mismatches.push(r.event)
    free = Math.min(max, Math.max(0, free - r.event_transfers) + 1)
  }
  return { free, mismatches }
}

async function fetchMySquad(events, elements, maxExtraFree, kinds) {
  const round = events.filter(e => new Date(e.deadline_time) <= new Date()).at(-1)?.id
  if (!round) return null
  const [entry, { picks }, transfers, { chips, current }] = await Promise.all([
    getJson(`${API}/entry/${MY_ENTRY_ID}/`),
    getJson(`${API}/entry/${MY_ENTRY_ID}/event/${round}/picks/`),
    getJson(`${API}/entry/${MY_ENTRY_ID}/transfers/`),
    getJson(`${API}/entry/${MY_ENTRY_ID}/history/`),
  ])
  const reverted = new Set(chips.filter(c => kinds.reverting.has(c.name)).map(c => c.event))
  // Newest first, so the first transfer in is the one that's still owned.
  const boughtFor = new Map()
  for (const t of transfers) {
    if (t.event <= round && !reverted.has(t.event) && !boughtFor.has(t.element_in)) boughtFor.set(t.element_in, t.element_in_cost / 10)
  }
  const { free, mismatches } = freeTransfers(current.filter(c => c.event <= round), new Set(chips.filter(c => kinds.transfer.has(c.name)).map(c => c.event)), 1 + maxExtraFree)
  if (mismatches.length) console.log(`${LOG} free-transfer estimate disagrees with the hits paid in rounds ${mismatches.join(', ')}`)
  const byId = new Map(elements.map(e => [e.id, e]))
  // Never transferred in means picked before round 1 (the entry started in round 1), at the start price.
  const startPrice = id => (byId.get(id).now_cost - byId.get(id).cost_change_start) / 10
  return {
    entryId: MY_ENTRY_ID,
    name: entry.name,
    round,
    rank: entry.summary_overall_rank,
    total: entry.summary_overall_points,
    bank: (current.find(c => c.event === round)?.bank ?? 0) / 10,
    freeTransfers: free,
    transferCost: HIT,
    chipsUsed: chips.map(c => ({ name: c.name, round: c.event })),
    // Points per round, for what each chip scored.
    points: Object.fromEntries(current.map(c => [c.event, c.points])),
    // Positions 12–15 are the bench.
    picks: picks.map(p => ({
      id: p.element,
      captain: p.is_captain,
      vice: p.is_vice_captain,
      bench: p.position > 11,
      purchasePrice: boughtFor.get(p.element) ?? startPrice(p.element),
    })),
  }
}

// The user's seasons, kept across team ids: every past season's total and
// final rank from the game, and this season's rounds added to the archive in
// src/data/<league>History.json, which never drops a season it holds.
//
// Entry ids are reused, so an id left over from last season belongs to a
// stranger. The game lists the entry's past seasons; if those don't match the
// seasons already archived, nothing is written.
//
// Only finished rounds are kept, and the file is only rewritten when they
// change: the deploy workflow commits it back to main, about once a round.
async function archiveHistory(season, finished) {
  let archive
  try {
    archive = JSON.parse(readFileSync(HISTORY_OUT, 'utf8'))
  } catch {
    archive = { note: 'Past seasons from the game\'s history (totals and final ranks); each season\'s finished rounds are archived by scripts/fetch-fantasy-players.mjs as they\'re played.', seasons: [], rounds: {} }
  }
  const history = await getJson(`${API}/entry/${MY_ENTRY_ID}/history/`)
  const { past } = history
  const current = history.current.filter(c => finished.has(c.event))
  const pastSeasons = past.map(p => ({ season: p.season_name, points: p.total_points, rank: p.rank }))
  const known = archive.seasons.filter(a => a.season !== season)
  const mismatch = known.find(a => !pastSeasons.some(p => p.season === a.season && p.points === a.points))
  if (mismatch) return `history skipped: entry ${MY_ENTRY_ID} has no ${mismatch.season} season matching the archive (update MY_ENTRY_ID for this season?)`
  const last = current.at(-1)
  const seasons = [...pastSeasons, ...(last ? [{ season, points: last.total_points, rank: last.overall_rank, live: true }] : [])]
  const rows = current.map(c => ({
    round: c.event,
    points: c.points,
    total: c.total_points,
    rank: c.rank,
    overallRank: c.overall_rank,
    hits: c.event_transfers_cost,
    bench: c.points_on_bench,
  }))
  if (JSON.stringify(seasons) === JSON.stringify(archive.seasons) && JSON.stringify(rows) === JSON.stringify(archive.rounds[season] ?? [])) {
    return `history unchanged (${rows.length} finished rounds of ${season})`
  }
  archive.generatedAt = new Date().toISOString()
  archive.seasons = seasons
  archive.rounds[season] = rows
  const lines = rows => rows.map(r => `      ${JSON.stringify(r)}`).join(',\n')
  const rounds = Object.entries(archive.rounds).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => `    ${JSON.stringify(key)}: [\n${lines(rows)}\n    ]`).join(',\n')
  writeFileSync(HISTORY_OUT, `{
  "generatedAt": ${JSON.stringify(archive.generatedAt)},
  "note": ${JSON.stringify(archive.note)},
  "seasons": [\n${archive.seasons.map(r => `    ${JSON.stringify(r)}`).join(',\n')}\n  ],
  "rounds": {\n${rounds}\n  }
}\n`)
  return `history: ${pastSeasons.length} past seasons, ${rows.length} finished rounds of ${season}`
}

// The overall top 50's squads for the same round as the user's. A chip
// (wildcard, free hit) is kept so a one-round squad can be told apart.
async function fetchTopManagers(round) {
  const { standings } = await getJson(`${API}/leagues-classic/${OVERALL_LEAGUE_ID}/standings/`)
  const picks = await mapLimit(standings.results, 8, r => getJson(`${API}/entry/${r.entry}/event/${round}/picks/`))
  return {
    round,
    entries: standings.results.map((r, i) => ({
      id: r.entry,
      name: r.entry_name,
      rank: r.rank,
      total: r.total,
      chip: picks[i].active_chip,
      captain: picks[i].picks.find(p => p.is_captain)?.element ?? null,
      picks: picks[i].picks.map(p => p.element),
    })),
  }
}

try {
  const existing = readExisting()
  const [{ events, teams, elements, chips, game_settings: settings }, fixtureFeed] = await Promise.all([
    getJson(`${API}/bootstrap-static/`),
    getJson(`${API}/fixtures/`),
  ])
  if (!elements?.length) throw new Error('bootstrap has no players')
  const fixtures = fixtureFeed.map(f => ({
    id: f.id,
    round: f.event,
    kickoff: f.kickoff_time ? new Date(f.kickoff_time).toISOString() : null,
    home: f.team_h,
    away: f.team_a,
    homeScore: f.finished ? f.team_h_score : null,
    awayScore: f.finished ? f.team_a_score : null,
  }))

  // Only finished rounds: a round in progress would skew the last-N windows.
  const rounds = events.filter(e => e.finished).map(e => e.id).sort((a, b) => a - b)
  const lives = await Promise.all(rounds.map(id => getJson(`${API}/event/${id}/live/`)))

  // A player missing from a round's feed wasn't in the game yet: null, not 0.
  // Double rounds come back already summed per player.
  const stats = new Map()
  lives.forEach((live, i) => {
    for (const { id, stats: s } of live.elements) {
      if (!stats.has(id)) stats.set(id, { points: Array(rounds.length).fill(null), minutes: Array(rounds.length).fill(null) })
      stats.get(id).points[i] = s.total_points
      stats.get(id).minutes[i] = s.minutes
    }
  })

  const active = elements.filter(e => !e.removed)
  const teamNames = Object.fromEntries(teams.map(t => [t.id, t.name]))
  let penaltiesById
  let penaltyNote
  let roundsNote
  try {
    const espnEvents = await fetchEspnEvents()
    try {
      const espnRoundMap = espnRounds(espnEvents, fixtures)
      writeFileSync(ROUNDS_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rounds: espnRoundMap }, null, 2) + '\n')
      roundsNote = `${Object.keys(espnRoundMap).length} ESPN matches mapped to rounds`
    } catch (err) {
      roundsNote = `round mapping failed (${err.message}), kept the existing one`
    }
    const { matches, penalties } = await fetchPenalties(espnEvents)
    penaltiesById = new Map()
    const unmatched = new Set()
    for (const pen of penalties) {
      const player = matchPlayer(pen.name, active, teamNames)
      if (!player) { unmatched.add(pen.name); continue }
      const p = penaltiesById.get(player.id) ?? { taken: 0, scored: 0, last: null }
      p.taken++
      if (pen.scored) p.scored++
      if (pen.date && (!p.last || pen.date > p.last)) p.last = pen.date
      penaltiesById.set(player.id, p)
    }
    penaltyNote = `${penalties.length} penalties in ${matches} matches${unmatched.size ? ` (no fantasy player for ${[...unmatched].join(', ')})` : ''}`
  } catch (err) {
    penaltiesById = new Map((existing?.players ?? []).filter(p => p.penalties).map(p => [p.id, p.penalties]))
    penaltyNote = `ESPN penalties failed (${err.message}), kept the existing ones`
  }

  let absenceById
  let yellowsById
  let transfermarktNote
  try {
    const { absences, yellows } = await fetchTransfermarkt()
    const unmatched = []
    const byId = (rows, value) => new Map(rows.flatMap(row => {
      const player = matchPlayer(row.name, active, teamNames, row.club)
      if (!player) { unmatched.push(row.name); return [] }
      return [[player.id, value(row)]]
    }))
    absenceById = byId(absences, ({ type, reason, until }) => ({ type, reason, until }))
    yellowsById = byId(yellows, row => row.cards)
    transfermarktNote = `${absenceById.size} out and ${yellowsById.size} at risk of a ban${unmatched.length ? ` (no fantasy player for ${unmatched.join(', ')})` : ''}`
  } catch (err) {
    const kept = existing?.players ?? []
    absenceById = new Map(kept.filter(p => p.absence).map(p => [p.id, p.absence]))
    yellowsById = new Map(kept.filter(p => p.yellowCards).map(p => [p.id, p.yellowCards]))
    transfermarktNote = `Transfermarkt failed (${err.message}), kept the existing absences`
  }

  let mySquad
  try {
    mySquad = await fetchMySquad(events, elements, settings.max_extra_free_transfers, chipKinds(chips))
  } catch (err) {
    mySquad = existing?.mySquad ?? null
    console.log(`${LOG} squad fetch failed (${err.message}), kept the existing one`)
  }

  let historyNote
  try {
    // Seasons fall inside one calendar year.
    historyNote = await archiveHistory(String(new Date(events[0].deadline_time).getUTCFullYear()), new Set(rounds))
  } catch (err) {
    historyNote = `history failed (${err.message}), kept the existing archive`
  }

  let topManagers
  try {
    topManagers = mySquad ? await fetchTopManagers(mySquad.round) : null
  } catch (err) {
    topManagers = existing?.topManagers ?? null
    console.log(`${LOG} top managers fetch failed (${err.message}), kept the existing ones`)
  }

  let mismatched = 0
  const players = active.map(e => {
    const s = stats.get(e.id) ?? { points: Array(rounds.length).fill(null), minutes: Array(rounds.length).fill(null) }
    if (s.points.reduce((sum, p) => sum + (p ?? 0), 0) !== e.total_points) mismatched++
    return {
      id: e.id,
      // First given name + surname: "Fredrik André" + "Bjørkan" → "Fredrik Bjørkan".
      name: [e.first_name.split(' ')[0], e.second_name].filter(Boolean).join(' ') || e.web_name,
      fullName: `${e.first_name} ${e.second_name}`.trim(),
      shortName: e.web_name,
      team: e.team,
      position: e.element_type,
      price: e.now_cost / 10,
      ownership: Number(e.selected_by_percent),
      status: e.status,
      // Percent, set only when there's news (injury, doubt); null means no concern.
      chance: e.chance_of_playing_next_round,
      news: e.news || null,
      penalties: penaltiesById.get(e.id) ?? null,
      // Transfermarkt: out injured or suspended, and yellow cards when one booking from a ban.
      absence: absenceById.get(e.id) ?? null,
      yellowCards: yellowsById.get(e.id) ?? null,
      points: s.points,
      minutes: s.minutes,
    }
  })

  // Squad rules and chip windows, for the transfer and chip planner.
  const rules = {
    squadTeamLimit: settings.squad_team_limit,
    sellOnFee: settings.transfers_sell_on_fee,
    maxFreeTransfers: 1 + settings.max_extra_free_transfers,
    chips: chips.map(c => ({ name: c.name, start: c.start_event, stop: c.stop_event, type: c.chip_type })),
  }
  // The game also lists clubs outside the league; keep the ones with fixtures.
  const leagueTeams = new Set(fixtures.map(f => f.home))
  const teamRows = teams.filter(t => leagueTeams.has(t.id)).map(t => ({ id: t.id, name: t.name, short: t.short_name }))
  // One team and one player per line keeps the committed fallback small and diffable.
  const lines = rows => rows.map(r => `    ${JSON.stringify(r)}`).join(',\n')
  const json = `{
  "generatedAt": ${JSON.stringify(new Date().toISOString())},
  "rounds": ${JSON.stringify(rounds)},
  "rules": ${JSON.stringify(rules)},
  "mySquad": ${JSON.stringify(mySquad)},
  "topManagers": ${topManagers ? `{
    "round": ${topManagers.round},
    "entries": [\n${topManagers.entries.map(r => `      ${JSON.stringify(r)}`).join(',\n')}\n    ]
  }` : 'null'},
  "teams": [\n${lines(teamRows)}\n  ],
  "fixtures": [\n${lines(fixtures)}\n  ],
  "players": [\n${lines(players)}\n  ]
}`
  writeFileSync(OUT, json + '\n')
  console.log(`${LOG} ${players.length} players through round ${rounds.at(-1) ?? 0}; ${penaltyNote}; ${roundsNote ?? 'round mapping skipped'}; ${transfermarktNote}; squad ${mySquad ? `for round ${mySquad.round}` : 'unavailable'}; ${historyNote}${mismatched ? `; ${mismatched} with a season total that differs from their round sum (scoring corrections)` : ''}`)
} catch (err) {
  console.log(`${LOG} failed (${err.message}); keeping the existing ${OUT}`)
}
