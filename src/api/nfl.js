const SITE = 'https://site.api.espn.com/apis'
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'

// NFL schedules are announced ~mid-May for the season kicking off that
// September — months before games start — so switch over as soon as the new
// season's data would plausibly exist, not once games begin.
export function getNFLSeason() {
  const now = new Date()
  return now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1
}

async function getJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN API error ${res.status}`)
  return res.json()
}

const statValue = (stats, name) => stats?.find(s => s.name === name)?.value ?? 0

// ─── League-wide team ranking ────────────────────────────────────────────────

/**
 * All 32 teams ranked across the whole league by win percentage — the measure
 * NFL seeding uses, and one ESPN already computes with ties counted as half a
 * win.
 *
 * Teams on the same win percentage share a rank and the following rank skips
 * (standard competition ranking), so an early-season table reads "six teams at
 * [1]" rather than inventing an order between identical 1-0 records. Wins and
 * losses only order the display list, never the rank itself.
 */
export async function fetchNFLTeamRanks() {
  const season = getNFLSeason()
  const data = await getJSON(`${SITE}/v2/sports/football/nfl/standings?season=${season}`)

  const teams = (data.children ?? []).flatMap(conf =>
    (conf.standings?.entries ?? []).map(entry => ({
      teamId:       entry.team?.id,
      abbreviation: entry.team?.abbreviation,
      name:         entry.team?.displayName,
      wins:         Math.round(statValue(entry.stats, 'wins')),
      losses:       Math.round(statValue(entry.stats, 'losses')),
      ties:         Math.round(statValue(entry.stats, 'ties')),
      winPercent:   statValue(entry.stats, 'winPercent'),
    }))
  )

  teams.sort((a, b) =>
    b.winPercent - a.winPercent || b.wins - a.wins || a.losses - b.losses
  )

  const rankByTeamId = {}
  let rank = 0
  teams.forEach((team, i) => {
    if (i === 0 || teams[i - 1].winPercent !== team.winPercent) rank = i + 1
    team.rank = rank
    rankByTeamId[team.teamId] = rank
  })

  return { season, teams, rankByTeamId }
}

