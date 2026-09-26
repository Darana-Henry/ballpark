// NFL week identity, shared by the schedule views and the queue's week filter.
//
// Regular-season games carry a week number 1-18. Playoff games restart their
// numbering at 1, so they're keyed by round name instead — otherwise "Week 1"
// would mean two different things in the same dropdown.

const PLAYOFF_ORDER = ['Wild Card', 'Divisional', 'Conference', 'Super Bowl']

export function getNFLPlayoffRound(gameType, gameDate) {
  if (!gameType || gameType === 'Regular Season') return null
  const gt = gameType.toLowerCase()
  if (gt.includes('super bowl')) return 'Super Bowl'
  if (gt.includes('championship')) return 'Conference'
  if (gt.includes('divisional') || gt.includes('division')) return 'Divisional'
  if (gt.includes('wild card')) return 'Wild Card'
  // Date-based fallback when gameType is generic 'Playoffs'
  if (gameDate) {
    const d = new Date(gameDate)
    const m = d.getMonth(), day = d.getDate()
    if (m === 1) return 'Super Bowl'           // February
    if (m === 0 && day >= 24) return 'Conference'
    if (m === 0 && day >= 16) return 'Divisional'
    if (m === 0) return 'Wild Card'
  }
  return 'Wild Card'
}

// getNFLPlayoffRound() answers "which round is this", and falls back to Wild
// Card for anything it can't place — fine for a game already known to be a
// playoff, wrong as a test of whether it is one. Plenty of regular-season
// games carry a non-standard gameType ("NFL London Games", "Flex Game: 12/26"),
// so seasonType is the authority here, with a keyword check only as a fallback
// for games that predate the field.
const PLAYOFF_GAMETYPE = /wild ?card|divisional|championship|super bowl|playoff/i

const isPlayoff = game =>
  game.seasonType === 3 ||
  (game.seasonType == null && PLAYOFF_GAMETYPE.test(game.gameType ?? ''))

// Stable id for the week a game belongs to.
export function weekId(game) {
  if (isPlayoff(game)) return `po:${getNFLPlayoffRound(game.gameType, game.gameDate) ?? 'Wild Card'}`
  return game.week != null ? `rs:${game.week}` : null
}

export const matchesWeek = (game, id) => id === 'all' || weekId(game) === id

// Every week present in the schedule, regular season first then playoff rounds
// in bracket order.
export function buildWeekOptions(games) {
  const regular = new Set()
  const playoffs = new Set()
  for (const g of games) {
    const id = weekId(g)
    if (!id) continue
    if (id.startsWith('rs:')) regular.add(Number(id.slice(3)))
    else playoffs.add(id.slice(3))
  }

  return [
    { id: 'all', label: 'All weeks' },
    ...[...regular].sort((a, b) => a - b).map(n => ({ id: `rs:${n}`, label: `Week ${n}` })),
    ...[...playoffs]
      .sort((a, b) => PLAYOFF_ORDER.indexOf(a) - PLAYOFF_ORDER.indexOf(b))
      .map(name => ({ id: `po:${name}`, label: name })),
  ]
}

// The week in progress, or the next one with games still to come. Falls back to
// the last week played once the season is over.
export function defaultWeekId(games, now = new Date()) {
  const byId = new Map()
  for (const g of games) {
    const id = weekId(g)
    if (!id) continue
    const span = byId.get(id) ?? { first: g.gameDate, last: g.gameDate }
    if (g.gameDate < span.first) span.first = g.gameDate
    if (g.gameDate > span.last) span.last = g.gameDate
    byId.set(id, span)
  }
  if (!byId.size) return 'all'

  const spans = [...byId.entries()].sort((a, b) => a[1].first - b[1].first)
  // A week stays "current" until a day after its last kickoff, so Monday night
  // games don't push the queue forward mid-week.
  const DAY = 24 * 60 * 60 * 1000
  const current = spans.find(([, s]) => now <= new Date(s.last.getTime() + DAY))
  return (current ?? spans[spans.length - 1])[0]
}
