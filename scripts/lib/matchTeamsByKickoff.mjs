// Pairs a fantasy game's teams with ESPN's. The two use different team ids
// and names ("Man Utd" vs "Manchester United"), so teams are matched by their
// kickoff times instead: across a season each team's set of kickoffs is
// unique to it. Fixtures are `{ kickoff, home, away }` with ISO kickoffs.

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

// Each fantasy team goes to the ESPN team sharing the most kickoff times,
// strongest overlaps first so a clear match is never stolen by a weak one.
export function matchTeamsByKickoff(fantasyFixtures, espnFixtures) {
  const fantasy = kickoffsByTeam(fantasyFixtures)
  const espn = kickoffsByTeam(espnFixtures)
  const pairs = []
  for (const [fantasyTeam, a] of fantasy) {
    for (const [espnTeam, b] of espn) {
      let shared = 0
      for (const k of a) if (b.has(k)) shared++
      if (shared) pairs.push({ fantasyTeam, espnTeam, shared })
    }
  }
  pairs.sort((x, y) => y.shared - x.shared)
  const map = new Map()
  const taken = new Set()
  for (const { fantasyTeam, espnTeam } of pairs) {
    if (map.has(fantasyTeam) || taken.has(espnTeam)) continue
    map.set(fantasyTeam, espnTeam)
    taken.add(espnTeam)
  }
  return map
}
