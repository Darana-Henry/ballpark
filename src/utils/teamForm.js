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
 * Week-by-week grid for the NFL season, one row per team: weeks 1-18, then a
 * column per playoff round once the schedule has one.
 *
 * A regular-season week with no fixture is a bye (`B`) and a playoff round a
 * team isn't in is `-`; both come from the schedule, not from any result, so
 * they're safe to show. A fixture the user hasn't marked watched stays `null`
 * and renders as a placeholder: the row only fills in as games are marked,
 * which is the point.
 */
const ROUND_LABELS = { 'Wild Card': 'WC', Divisional: 'DIV', Conference: 'CONF', 'Super Bowl': 'SB' }
const ROUND_ORDER = Object.keys(ROUND_LABELS)

export function buildSeasonGrid(games, watchedGames, teamIdByAbbr, season) {
  const watchedById = {}
  for (const record of Object.values(watchedGames)) {
    if (record.league === 'nfl' && record.watched) watchedById[record.gameId] = record
  }

  const seasonGames = games.filter(g =>
    weekId(g) && (season == null || getSeasonYear('nfl', g.gameDate) === season))

  const regular = [...new Set(
    seasonGames.filter(g => g.seasonType === 2 && g.week != null).map(g => g.week)
  )].sort((a, b) => a - b)
  const rounds = ROUND_ORDER.filter(r => seasonGames.some(g => weekId(g) === `po:${r}`))

  const columns = [
    ...regular.map(w => ({ id: `rs:${w}`, label: String(w), playoff: false })),
    ...rounds.map(r => ({ id: `po:${r}`, label: ROUND_LABELS[r], playoff: true })),
  ]

  const rows = {}
  for (const [abbr, teamId] of Object.entries(teamIdByAbbr)) {
    const byColumn = {}
    for (const game of seasonGames) {
      const isTeam = String(game.homeTeam.id) === String(teamId) || String(game.awayTeam.id) === String(teamId)
      if (!isTeam) continue
      const col = weekId(game)
      if (!col.startsWith('po:') && game.seasonType !== 2) continue
      const record = watchedById[game.id]
      byColumn[col] = record ? resultForTeam(record, teamId) : null
    }
    rows[abbr] = columns.map(c => (c.id in byColumn ? byColumn[c.id] : c.playoff ? '-' : 'B'))
  }
  return { columns, rows }
}

// Re-exported so callers grouping a schedule by week don't need both modules.
export { weekId }
