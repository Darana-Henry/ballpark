// Maps every Premier League match on ESPN to its official FPL gameweek and
// writes the map to src/data/plGameweeks.json, which the Europe tab's
// Premier League view uses to group fixtures. ESPN has no gameweek field, and
// grouping by date misplaces postponed and rescheduled matches; FPL moves
// those into the gameweek they're actually played in.
//
// The two sources use different team ids and names ("Man Utd" vs "Manchester
// United"), so teams are matched by their kickoff times instead: across a
// season each team's set of kickoffs is unique to it.
//
// Usage: node scripts/fetch-pl-gameweeks.mjs
// On failure the existing JSON is left untouched and the script exits 0, so
// an FPL or ESPN outage never blocks a deploy.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../src/data/plGameweeks.json', import.meta.url))
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36' }
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard'

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

// English seasons run August–May; season 2026 = 2026-27. One request per
// month, since ESPN ignores date ranges (see src/api/espnDates.js).
async function fetchEspnFixtures() {
  const now = new Date()
  const start = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  const months = Array.from({ length: 11 }, (_, i) => {
    const month = (7 + i) % 12
    return `${start + (7 + i >= 12 ? 1 : 0)}${String(month + 1).padStart(2, '0')}`
  })
  const pages = await Promise.all(months.map(m => getJson(`${ESPN}?dates=${m}&limit=300`).then(d => d.events ?? [])))
  const seen = new Set()
  return pages.flat()
    .filter(e => e?.id && !seen.has(e.id) && seen.add(e.id))
    .map(e => {
      const cs = e.competitions?.[0]?.competitors ?? []
      return {
        id: e.id,
        kickoff: new Date(e.date).toISOString(),
        home: cs.find(c => c.homeAway === 'home')?.team?.id,
        away: cs.find(c => c.homeAway === 'away')?.team?.id,
      }
    })
    .filter(f => f.home && f.away)
}

function kickoffsByTeam(fixtures) {
  const byTeam = new Map()
  for (const f of fixtures) {
    if (!f.kickoff) continue
    for (const team of [f.home, f.away]) {
      if (!byTeam.has(team)) byTeam.set(team, new Set())
      byTeam.get(team).add(f.kickoff)
    }
  }
  return byTeam
}

// Pairs each FPL team with the ESPN team sharing the most kickoff times,
// strongest overlaps first so a clear match is never stolen by a weak one.
function matchTeams(fplFixtures, espnFixtures) {
  const fpl = kickoffsByTeam(fplFixtures)
  const espn = kickoffsByTeam(espnFixtures)
  const pairs = []
  for (const [fplTeam, a] of fpl) {
    for (const [espnTeam, b] of espn) {
      let shared = 0
      for (const k of a) if (b.has(k)) shared++
      if (shared) pairs.push({ fplTeam, espnTeam, shared })
    }
  }
  pairs.sort((x, y) => y.shared - x.shared)
  const map = new Map()
  const taken = new Set()
  for (const { fplTeam, espnTeam } of pairs) {
    if (map.has(fplTeam) || taken.has(espnTeam)) continue
    map.set(fplTeam, espnTeam)
    taken.add(espnTeam)
  }
  return map
}

try {
  const [fplFixtures, espnFixtures] = await Promise.all([
    getJson('https://fantasy.premierleague.com/api/fixtures/').then(fixtures => fixtures.map(f => ({
      gameweek: f.event,
      kickoff: f.kickoff_time ? new Date(f.kickoff_time).toISOString() : null,
      home: f.team_h,
      away: f.team_a,
    }))),
    fetchEspnFixtures(),
  ])

  const teams = matchTeams(fplFixtures, espnFixtures)
  if (teams.size !== 20) throw new Error(`matched ${teams.size} of 20 teams`)

  // Each home/away pairing happens once a season, so it identifies a match
  // regardless of when it's rescheduled to.
  const espnByPair = new Map(espnFixtures.map(f => [`${f.home}-${f.away}`, f.id]))
  const gameweeks = {}
  let unscheduled = 0
  for (const f of fplFixtures) {
    const id = espnByPair.get(`${teams.get(f.home)}-${teams.get(f.away)}`)
    if (!id) throw new Error(`no ESPN match for FPL fixture ${f.home} v ${f.away}`)
    // A postponed match with no new date has no gameweek until FPL gives it one.
    if (f.gameweek == null) unscheduled++
    else gameweeks[id] = f.gameweek
  }

  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), gameweeks }, null, 2) + '\n')
  console.log(`pl gameweeks: mapped ${Object.keys(gameweeks).length} matches${unscheduled ? `, ${unscheduled} awaiting a new date` : ''}`)
} catch (err) {
  console.log(`pl gameweeks: failed (${err.message}); keeping the existing ${OUT}`)
}
