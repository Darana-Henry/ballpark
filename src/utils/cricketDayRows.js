const DAYS_PER_TEST = 5

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
      gameType: `Test · Day ${n}`,
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
