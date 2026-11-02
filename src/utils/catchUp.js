// How many NFL games a day the user needs to watch to be caught up by the
// time the playoffs start: every regular-season game they haven't watched or
// skipped (played already, or still to come), spread over the days left
// before the first Wild Card game. Being caught up then means the playoffs
// can be watched live, with no backlog to protect from spoilers.

const DAY = 86400000

const isPlayoff = g => g.seasonType === 3

/**
 * The start of the day the playoffs begin. ESPN lists the playoff games
 * (teams TBD) from early in the season; failing that, the Saturday after the
 * last regular-season game, when Wild Card weekend has always started.
 * `estimated` says which.
 */
export function playoffStart(games) {
  const first = games.filter(isPlayoff).reduce((min, g) => (!min || g.gameDate < min ? g.gameDate : min), null)
  if (first) {
    const day = new Date(first)
    day.setHours(0, 0, 0, 0)
    return { date: day, estimated: false }
  }
  const last = games.filter(g => !isPlayoff(g)).reduce((max, g) => (!max || g.gameDate > max ? g.gameDate : max), null)
  if (!last) return null
  const day = new Date(last)
  day.setHours(0, 0, 0, 0)
  day.setDate(day.getDate() + (((6 - day.getDay()) + 7) % 7 || 7))
  return { date: day, estimated: true }
}

/**
 * The catch-up plan, or null once the playoffs have started.
 * `isDone(game)` is true for a game watched or skipped; `watchedAt` lists
 * when NFL games were marked watched, for the recent pace.
 */
export function catchUpPlan(games, isDone, watchedAt, now = new Date()) {
  const start = playoffStart(games)
  if (!start || now >= start.date) return null
  const regular = games.filter(g => !isPlayoff(g))
  return { ...paceToDeadline(regular, isDone, watchedAt, start.date, now), estimated: start.estimated }
}

/**
 * The same plan for any deadline: every item not done (played already, or
 * still to come before `deadline`), spread over the days left counting today,
 * with the last 14 days' pace from `watchedAt` (times things were marked
 * watched). Items are whatever counts as one sitting: an NFL game, a cricket
 * T20I or ODI, or one day of a Test.
 */
export function paceToDeadline(items, isDone, watchedAt, deadline, now = new Date()) {
  const behind = items.filter(g => g.status === 'final' && !isDone(g)).length
  const toCome = items.filter(g => g.status !== 'final' && !isDone(g)).length
  const total = behind + toCome
  // Days left, counting today: a game watched tonight still counts.
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = Math.max(1, Math.round((deadline - today) / DAY))
  // Pace over the last 14 days, from when games were marked watched.
  const since = now - 14 * DAY
  const recent = watchedAt.filter(t => t >= since && t <= now).length
  const pace = recent / 14
  const projectedLeft = Math.max(0, total - Math.round(pace * days))
  return {
    start: deadline,
    estimated: false,
    behind,
    toCome,
    total,
    days,
    perDay: total / days,
    perWeek: (total / days) * 7,
    recent,
    pace,
    projectedLeft,
    // The day the backlog clears at the recent pace.
    finishBy: pace > 0 ? new Date(today.getTime() + Math.ceil(total / pace) * DAY) : null,
  }
}
