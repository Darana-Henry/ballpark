import { getSeasonYear } from './season'
import { weekId } from './nflWeeks'

// Recent form and season-long performance, both derived only from games the
// user has marked watched. Nothing here reads a live score: an unwatched game
// contributes no result, so the strips can never reveal an outcome the user
// hasn't chosen to see.

export const FORM_STYLES = {
  W: { label: 'W', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  L: { label: 'L', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  D: { label: 'D', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  B: { label: 'B', className: 'bg-transparent text-slate-700 border-slate-800' },
}

// A watched record stores scores flat, so the result is read from the
// perspective of whichever side the team was on.
export function resultForTeam(record, teamId) {
  if (record.homeScore == null || record.awayScore == null) return null
  const isHome = String(record.homeTeamId) === String(teamId)
  const isAway = String(record.awayTeamId) === String(teamId)
  if (!isHome && !isAway) return null

  const own = isHome ? record.homeScore : record.awayScore
  const other = isHome ? record.awayScore : record.homeScore
  if (own === other) return 'D'
  return own > other ? 'W' : 'L'
}

/**
 * Chronological results per team id, oldest first, for one league.
 * `season` restricts to a single season year; omit it for all time.
 */
export function buildFormByTeam(watchedGames, league, season = null) {
  const byTeam = {}

  const records = Object.values(watchedGames)
    .filter(r => r.league === league && r.watched && r.gameDate)
    .filter(r => season == null || getSeasonYear(league, r.gameDate) === season)
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))

  for (const record of records) {
    for (const teamId of [record.homeTeamId, record.awayTeamId]) {
      if (teamId == null) continue
      const result = resultForTeam(record, teamId)
      if (!result) continue
      ;(byTeam[teamId] ??= []).push({
        result,
        gameDate: record.gameDate,
        opponent: String(record.homeTeamId) === String(teamId) ? record.awayTeam : record.homeTeam,
      })
    }
  }
  return byTeam
}

export const lastN = (form, n = 5) => (form ?? []).slice(-n)

/**
 * Week-by-week grid for the NFL season, one row per team.
 *
 * A week with no fixture is a bye (`B`) — that comes from the schedule, not
 * from any result, so it's safe to show. A week with a fixture the user hasn't
 * marked watched stays `null` and renders as a placeholder: the row only fills
 * in as games are marked, which is the point.
 */
export function buildSeasonGrid(games, watchedGames, teamIdByAbbr, season) {
  const watchedById = {}
  for (const record of Object.values(watchedGames)) {
    if (record.league === 'nfl' && record.watched) watchedById[record.gameId] = record
  }

  const weeks = [...new Set(
    games
      .filter(g => g.seasonType === 2 && g.week != null)
      .map(g => g.week)
  )].sort((a, b) => a - b)

  const rows = {}
  for (const [abbr, teamId] of Object.entries(teamIdByAbbr)) {
    const byWeek = {}
    for (const game of games) {
      if (game.seasonType !== 2 || game.week == null) continue
      if (season != null && getSeasonYear('nfl', game.gameDate) !== season) continue
      const isTeam = String(game.homeTeam.id) === String(teamId) || String(game.awayTeam.id) === String(teamId)
      if (!isTeam) continue

      const record = watchedById[game.id]
      byWeek[game.week] = record ? resultForTeam(record, teamId) : null
    }
    rows[abbr] = weeks.map(week => (week in byWeek ? byWeek[week] : 'B'))
  }
  return { weeks, rows }
}

// Re-exported so callers grouping a schedule by week don't need both modules.
export { weekId }
