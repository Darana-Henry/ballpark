export const DAYS_PER_TEST = 5

// A finished cricket match that never really happened: rained out, abandoned
// or cancelled, or ended "No result" after a few overs. There's nothing to go
// and find a link for, so these count as seen without being ticked off and are
// shown in the draw colour. The user doesn't count that as a spoiler.
const NOT_PLAYED_RESULT = /no result|abandoned|cancelled/i

export function isNotPlayed(game) {
  if (game.notPlayed) return true
  if (game.league !== 'cricket' && game.league !== 'bbl') return false
  return game.status === 'final' && NOT_PLAYED_RESULT.test(game.statusDetail || '')
}

function sameCalendarDay(a, b) {
  return a.toDateString() === b.toDateString()
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// Expands a Test match into DAYS_PER_TEST day-rows. Score fields are never
// populated — the day-row is a "did you watch this day" checklist item, not a
// score record, so there's nothing to leak once GameCard reveals it.
// Status/statusDetail come from comparing the day's calendar date to today,
// except for days that won't be played: once the Test is over, every day after
// its real last day (and every day of an abandoned Test) is marked notPlayed,
// so it drops out of the queue instead of sending the user hunting for a link.
export function buildTestDayRows(match, today = new Date()) {
  const start = startOfDay(match.gameDate)
  const todayStart = startOfDay(today)
  const abandoned = isNotPlayed(match)
  const played = daysPlayed(match)

  return Array.from({ length: DAYS_PER_TEST }, (_, i) => {
    const n = i + 1
    const dayDate = new Date(start)
    dayDate.setDate(dayDate.getDate() + i)

    if (abandoned || n > played) {
      return { ...dayRowBase(match, n, dayDate), status: 'final', statusDetail: 'Not played', notPlayed: true }
    }

    const isFuture = dayDate > todayStart
    const isToday = sameCalendarDay(dayDate, todayStart)

    return {
      ...dayRowBase(match, n, dayDate),
      status: isFuture ? 'scheduled' : 'final',
      statusDetail: isFuture ? 'Upcoming' : isToday ? 'Live now' : 'Day complete',
    }
  })
}

function dayRowBase(match, n, dayDate) {
  return {
    id: `${match.id}_d${n}`,
    league: 'cricket',
    matchType: 'test',
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: null,
    awayScore: null,
    homeScoreStr: null,
    awayScoreStr: null,
    homeWon: false,
    awayWon: false,
    gameDate: dayDate,
    dateRange: null,
    gameType: `${match.gameType} · Day ${n}`,
    difficulty: null,
    seriesLabel: match.seriesLabel,
    highlightUrl: null,
    venue: match.venue,
    testMatchId: match.id,
  }
}

// Flattens a games list, expanding every Test into its day-rows and leaving
// other formats untouched.
export function expandTestDays(games, today = new Date()) {
  return games.flatMap(g => (g.matchType === 'test' ? buildTestDayRows(g, today) : [g]))
}

// How many of a Test's day-rows correspond to days actually played. Day-rows
// always number DAYS_PER_TEST (showing fewer would give away an early
// finish), but once a Test is final its endDate is the real last day, so a
// two-day Test is fully watched after two day-rows.
function daysPlayed(match) {
  if (match.status !== 'final' || !match.endDate) return DAYS_PER_TEST
  const days = Math.round((new Date(match.endDate) - new Date(match.gameDate)) / 86400000) + 1
  return Math.min(DAYS_PER_TEST, Math.max(1, days))
}

// A Test only counts as fully watched once every day-row for a
// day actually played has been checked off, not just one. Used wherever a
// result gets revealed (Series results, Results Log, Standings) — a match
// you've only partly watched shouldn't have its outcome spoiled.
export function isMatchFullyWatched(match, cricketWatchedIds) {
  if (isNotPlayed(match)) return true
  if (match.matchType === 'test') {
    return Array.from({ length: daysPlayed(match) }, (_, i) => `${match.id}_d${i + 1}`)
      .every(id => cricketWatchedIds.includes(id))
  }
  return cricketWatchedIds.includes(match.id)
}
