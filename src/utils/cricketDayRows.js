export const DAYS_PER_TEST = 5

function sameCalendarDay(a, b) {
  return a.toDateString() === b.toDateString()
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// Expands a Test match into DAYS_PER_TEST spoiler-safe day-rows. Score fields
// are never populated — the day-row is a "did you watch this day" checklist
// item, not a score record, so there's nothing to leak once GameCard reveals
// it. Status/statusDetail come only from comparing the day's calendar date to
// today, never from the real match's live/final state.
export function buildTestDayRows(match, today = new Date()) {
  const start = startOfDay(match.gameDate)
  const todayStart = startOfDay(today)

  return Array.from({ length: DAYS_PER_TEST }, (_, i) => {
    const n = i + 1
    const dayDate = new Date(start)
    dayDate.setDate(dayDate.getDate() + i)

    const isFuture = dayDate > todayStart
    const isToday = sameCalendarDay(dayDate, todayStart)

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
      status: isFuture ? 'scheduled' : 'final',
      statusDetail: isFuture ? 'Upcoming' : isToday ? 'Live now' : 'Day complete',
      gameDate: dayDate,
      dateRange: null,
      gameType: `${match.gameType} · Day ${n}`,
      difficulty: null,
      seriesLabel: match.seriesLabel,
      highlightUrl: null,
      venue: match.venue,
      testMatchId: match.id,
    }
  })
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
  if (match.matchType === 'test') {
    return Array.from({ length: daysPlayed(match) }, (_, i) => `${match.id}_d${i + 1}`)
      .every(id => cricketWatchedIds.includes(id))
  }
  return cricketWatchedIds.includes(match.id)
}
