// League table and fixture difficulty for the fantasy tabs, from the fantasy
// game's own fixture list in src/data/<league>Players.json.
//
// The game publishes no difficulty ratings, so a fixture is rated by the
// opponent's points per game: half over the season, half at the venue they
// play this one at (a team's home and away form can differ a lot), banded on
// fixed cut-offs so a rating means the same thing all season.

import { buildTable, NORDIC_LEAGUE } from './leaguePhase'

// Rounds in buildTable's matchday shape. Fixtures awaiting a new date have no
// round and are left out.
function matchdays(fixtures, teamsById) {
  const byRound = new Map()
  for (const f of fixtures) {
    if (f.round == null) continue
    if (!byRound.has(f.round)) byRound.set(f.round, [])
    byRound.get(f.round).push({
      home: teamsById[f.home],
      away: teamsById[f.away],
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      status: f.homeScore == null ? 'scheduled' : 'final',
      date: f.kickoff ? new Date(f.kickoff) : null,
    })
  }
  return [...byRound.entries()].sort(([a], [b]) => a - b).map(([number, list]) => ({ number, fixtures: list }))
}

// The table after round `throughRound` (all of them by default), as a Map of
// team id → row with rank, points, played, gf, ga and form.
export function leagueTable(fixtures, teams, throughRound = Infinity) {
  const teamsById = Object.fromEntries(teams.map(t => [t.id, { id: t.id, name: t.name, shortName: t.short }]))
  return buildTable(matchdays(fixtures, teamsById), throughRound + 1, NORDIC_LEAGUE)
}

// The first round with a match still to play: the one fixtures look ahead from.
export function nextRound(fixtures) {
  return Math.min(...fixtures.filter(f => f.homeScore == null && f.round != null).map(f => f.round))
}

// Points per game for each team, overall and at home/away.
function pointsPerGame(fixtures) {
  const tally = new Map()
  const add = (team, venue, pts) => {
    if (!tally.has(team)) tally.set(team, { all: [0, 0], home: [0, 0], away: [0, 0] })
    const t = tally.get(team)
    for (const key of ['all', venue]) { t[key][0] += pts; t[key][1]++ }
  }
  for (const f of fixtures) {
    if (f.homeScore == null) continue
    const home = f.homeScore > f.awayScore ? 3 : f.homeScore === f.awayScore ? 1 : 0
    const away = f.awayScore > f.homeScore ? 3 : f.homeScore === f.awayScore ? 1 : 0
    add(f.home, 'home', home)
    add(f.away, 'away', away)
  }
  const ppg = ([pts, games]) => (games ? pts / games : 1.4)
  return new Map([...tally].map(([team, t]) => [team, { all: ppg(t.all), home: ppg(t.home), away: ppg(t.away) }]))
}

export const DIFFICULTY = {
  1: { label: 'Very easy', className: 'bg-emerald-600/80 text-white' },
  2: { label: 'Easy',      className: 'bg-emerald-500/30 text-emerald-200' },
  3: { label: 'Medium',    className: 'bg-slate-600/50 text-slate-200' },
  4: { label: 'Hard',      className: 'bg-red-500/35 text-red-100' },
  5: { label: 'Very hard', className: 'bg-red-700/80 text-white' },
}

const bands = [[2.0, 5], [1.6, 4], [1.2, 3], [0.9, 2]]

/**
 * Every team's fixtures from `fromRound` on, by round: `byTeam.get(id)` is an
 * array of rounds, each a list (empty for a blank round, two for a double) of
 * `{ opponent, home, difficulty, strength }`.
 */
export function upcomingFixtures(fixtures, teams, fromRound, count) {
  const ppg = pointsPerGame(fixtures)
  const rate = (opponent, opponentVenue) => {
    const p = ppg.get(opponent) ?? { all: 1.4, home: 1.4, away: 1.4 }
    const strength = (p.all + p[opponentVenue]) / 2
    return { strength, difficulty: bands.find(([min]) => strength >= min)?.[1] ?? 1 }
  }
  const roundNumbers = Array.from({ length: count }, (_, i) => fromRound + i)
  const byTeam = new Map(teams.map(t => [t.id, roundNumbers.map(() => [])]))
  for (const f of fixtures) {
    const i = roundNumbers.indexOf(f.round)
    if (i === -1) continue
    byTeam.get(f.home)?.[i].push({ opponent: f.away, home: true, ...rate(f.away, 'away') })
    byTeam.get(f.away)?.[i].push({ opponent: f.home, home: false, ...rate(f.home, 'home') })
  }
  return { rounds: roundNumbers, byTeam }
}
