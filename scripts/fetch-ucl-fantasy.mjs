// Fetches the Champions League fantasy game's players, points per matchday,
// fixtures and squad rules from UEFA's public feeds and writes
// src/data/championsLeaguePlayers.json in the same shape as the Premier
// League platform's games (scripts/fetch-fantasy-players.mjs), so the shared
// fantasy tab can show it. Nothing here needs a login; the user's own team,
// leaderboards and history do, so `mySquad` and `topManagers` are null.
//
// Feeds (paths from the game's own config, services/feeds/config/web.json,
// whose `tourId` is the current season, so a new season is picked up
// without changes here):
//   fixtures/fixtures_{tour}_en.json         matchdays, kickoffs, scores
//   players/players_{tour}_en_{md}.json      every player as of matchday md;
//                                            `curGDPts` is that matchday's points
//   constraints/constraints_{tour}.json      budget and per-club limit
//   popupstats/popupstats_{tour}_{id}.json   one player's matchdays, with minutes
//
// Minutes per matchday only come per player, so they're worked out from the
// change in each player's season minutes when one new matchday has finished
// since the last run, and fetched per player (for those who've played) only
// when several have, as on the first run.
//
// Kickoffs in the feed are UEFA's local time (Central European), converted
// to UTC here. curl's requests to this host hang; Node's fetch is answered.
//
// Usage: node scripts/fetch-ucl-fantasy.mjs
// On failure the existing JSON is left untouched and the script exits 0, so
// an outage never blocks a deploy.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../src/data/championsLeaguePlayers.json', import.meta.url))
const FEEDS = 'https://gaming.uefa.com/en/uclfantasy/services/feeds/'
const LOG = 'championsLeague players:'

async function getJson(path) {
  const res = await fetch(FEEDS + path, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`)
  return res.json()
}

function readExisting() {
  try { return JSON.parse(readFileSync(OUT, 'utf8')) } catch { return null }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }))
  return results
}

// "11/03/2026 21:00:00" in Paris time → ISO UTC. The offset is read for that
// date, so summer and winter time both come out right.
function uefaTime(s) {
  const [, mo, d, y, h, mi, se] = s.match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+)/)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, se)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(asUtc)).map(p => [p.type, p.value]))
  const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - asUtc
  return new Date(asUtc - offset).toISOString()
}

// The game's status → the Premier League platform's letters, which the tab
// already reads: injured, doubtful, suspended, and not in the squad
// (unavailable). Its starting news (`trained`) goes in `news`.
const STATUS = { '': 'a', I: 'i', D: 'd', S: 's', NIS: 'u' }
const START_NEWS = 'In contention to start next game'

// UEFA bans a player for one match on their 3rd, 5th, 7th… yellow card.
const oneFromBan = yellows => (yellows > 0 && yellows % 2 === 0 ? yellows : null)

try {
  const existing = readExisting()
  const config = await getJson('config/web.json')
  const tour = (config.data?.value ?? config).tourId
  if (!tour) throw new Error('no tourId in the game config')

  const matchdays = (await getJson(`fixtures/fixtures_${tour}_en.json`)).data.value
  const constraints = (await getJson(`constraints/constraints_${tour}.json`)).data.value

  const teams = new Map()
  const fixtures = []
  for (const md of matchdays) {
    for (const m of md.match ?? []) {
      if (!m.htId || !m.atId) continue
      teams.set(m.htId, { id: m.htId, name: m.htName, short: m.htCCode })
      teams.set(m.atId, { id: m.atId, name: m.atName, short: m.atCCode })
      const done = String(m.matchStatus) === '2'
      fixtures.push({
        id: m.mId,
        round: md.mdId,
        kickoff: uefaTime(m.dateTime),
        home: m.htId,
        away: m.atId,
        homeScore: done ? Number(m.htScore) : null,
        awayScore: done ? Number(m.atScore) : null,
      })
    }
  }
  // A matchday counts once every one of its matches is finished.
  const rounds = matchdays
    .filter(md => md.match?.length && md.match.every(m => String(m.matchStatus) === '2'))
    .map(md => md.mdId)
  const current = matchdays.find(md => md.mdIsCurrent === 1 || md.gdIsCurrent === 1)?.mdId ?? (rounds.at(-1) ?? 0) + 1

  // Everyone as of now, and each finished matchday's points.
  const latest = (await getJson(`players/players_${tour}_en_${current}.json`)).data.value.playerList
  const pointsByRound = new Map()
  for (const md of rounds) {
    const list = (await getJson(`players/players_${tour}_en_${md}.json`)).data.value.playerList
    pointsByRound.set(md, new Map(list.map(p => [p.id, p.curGDPts ?? 0])))
  }

  // Minutes per matchday: carried over, derived, or fetched.
  const before = new Map((existing?.players ?? []).map(p => [String(p.id), p]))
  const keptRounds = existing?.season === tour ? existing.rounds ?? [] : []
  const newRounds = rounds.filter(r => !keptRounds.includes(r))
  const minutesKept = p => {
    const old = before.get(String(p.id))
    return rounds.map(r => {
      const i = keptRounds.indexOf(r)
      return i === -1 || !old ? null : old.minutes[i]
    })
  }
  let minutesById
  let minutesNote
  if (newRounds.length <= 1) {
    minutesById = new Map(latest.map(p => {
      const mins = minutesKept(p)
      if (newRounds.length) {
        const i = rounds.indexOf(newRounds[0])
        const earlier = mins.reduce((s, m) => s + (m ?? 0), 0)
        mins[i] = Math.max(0, (p.minsPlyd ?? 0) - earlier)
      }
      return [p.id, mins]
    }))
    minutesNote = newRounds.length ? `minutes for matchday ${newRounds[0]} from the season totals` : 'no new matchday'
  } else {
    const played = latest.filter(p => p.minsPlyd > 0)
    const stats = await mapLimit(played, 4, async p => {
      try {
        const v = (await getJson(`popupstats/popupstats_${tour}_${p.id}.json`)).data.value
        return [p.id, new Map((v.matchdayStats ?? []).map(s => [s.mdId, s.oF ?? 0]))]
      } catch {
        return [p.id, null]
      }
    })
    const byId = new Map(stats)
    minutesById = new Map(latest.map(p => {
      const perMd = byId.get(p.id)
      // A matchday a player sat out isn't listed: 0. Null only if their stats failed.
      return [p.id, rounds.map(r => (p.minsPlyd > 0 ? (perMd ? perMd.get(r) ?? 0 : null) : 0))]
    }))
    minutesNote = `minutes fetched for ${played.length} players across matchdays ${newRounds.join(', ')}`
  }

  const players = latest.map(p => ({
    id: Number(p.id),
    name: p.pFName || p.pDName,
    fullName: p.pFName || p.pDName,
    shortName: p.pDName,
    team: Number(p.tId),
    position: Number(p.skill),
    price: Number(p.value),
    ownership: Number(p.selPer) || 0,
    status: STATUS[p.pStatus] ?? 'a',
    // The game gives no percentage: doubtful, or unlikely to start, counts as an even chance.
    chance: p.pStatus === 'D' || (p.trained && p.trained !== START_NEWS) ? 50 : null,
    news: p.trained && p.trained !== START_NEWS ? p.trained : null,
    penalties: null,
    absence: null,
    yellowCards: oneFromBan(p.yC),
    // This game publishes these; the Premier League platform's don't.
    goals: p.gS ?? 0,
    assists: p.assist ?? 0,
    cleanSheets: p.cS ?? 0,
    saves: p.saves ?? 0,
    ballsRecovered: p.bR ?? 0,
    playerOfMatch: p.mOM ?? 0,
    points: rounds.map(r => pointsByRound.get(r).get(p.id) ?? null),
    minutes: minutesById.get(p.id),
  }))

  const minutesOff = latest.filter(p => {
    const mins = minutesById.get(p.id)
    return !mins.includes(null) && mins.reduce((s, m) => s + m, 0) !== (p.minsPlyd ?? 0)
  }).length
  if (minutesOff) minutesNote += `; ${minutesOff} whose matchday minutes don't add up to their season total`
  const mismatched = latest.filter(p => rounds.reduce((s, r) => s + (pointsByRound.get(r).get(p.id) ?? 0), 0) !== p.totPts).length
  const rules = {
    squadTeamLimit: constraints.maxTeamPlayers,
    budget: Number(constraints.maxTeamValue),
    chips: [],
  }
  const lines = rows => rows.map(r => `    ${JSON.stringify(r)}`).join(',\n')
  const json = `{
  "generatedAt": ${JSON.stringify(new Date().toISOString())},
  "season": ${JSON.stringify(tour)},
  "rounds": ${JSON.stringify(rounds)},
  "rules": ${JSON.stringify(rules)},
  "mySquad": null,
  "topManagers": null,
  "teams": [\n${lines([...teams.values()].sort((a, b) => a.name.localeCompare(b.name)))}\n  ],
  "fixtures": [\n${lines(fixtures)}\n  ],
  "players": [\n${lines(players)}\n  ]
}`
  writeFileSync(OUT, json + '\n')
  console.log(`${LOG} ${players.length} players, ${teams.size} clubs, through matchday ${rounds.at(-1) ?? 0} (season ${tour}); ${minutesNote}${mismatched ? `; ${mismatched} whose season total differs from their matchday sum` : ''}`)
} catch (err) {
  console.log(`${LOG} failed (${err.message}); keeping the existing ${OUT}`)
}
