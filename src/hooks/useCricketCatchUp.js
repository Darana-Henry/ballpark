import { useEffect, useMemo, useState } from 'react'
import { useWatched } from '../contexts/WatchedContext'
import { paceToDeadline } from '../utils/catchUp'
import { expandTestDays, isNotPlayed } from '../utils/cricketDayRows'
import { getCurrentSeasonYear, getSeasonYear } from '../utils/season'
import { loadLeagueGames } from '../api/seasonSchedules'

const LABELS = {
  title: 'To finish by the end of the year',
  unit: 'events',
  deadline: 'Year ends',
  atDeadline: 'at the end of the year',
  doneText: () => 'All caught up: nothing left to watch before the end of the year.',
}

/**
 * Cricket's catch-up plan: events a day to have watched everything by
 * 31 December. A T20I, an ODI or a BBL game is one event; a Test is five, one
 * per day-row, since one highlight a day is the unit. Counts everything this
 * year that's not watched, skipped or never played (washed out, or a Test day
 * after an early finish), whether already played or still to come.
 *
 * BBL comes from the CricAPI key's stored schedule (none without a key), and
 * only this BBL season's games dated before the new year.
 */
export function useCricketCatchUp(cricketGames) {
  const { watchedGames, isWatched, isDismissed } = useWatched()
  const [bblGames, setBblGames] = useState([])

  useEffect(() => {
    let cancelled = false
    loadLeagueGames('bbl').then(g => { if (!cancelled) setBblGames(g) })
    return () => { cancelled = true }
  }, [])

  return useMemo(() => {
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1) // start of 1 Jan: the deadline
    const inYear = g => g.gameDate >= yearStart && g.gameDate < yearEnd
    const bblSeason = getCurrentSeasonYear('bbl', now)

    const items = [
      ...expandTestDays(cricketGames ?? []).filter(inYear),
      ...bblGames.filter(g => inYear(g) && getSeasonYear('bbl', g.gameDate) === bblSeason),
    ]
    const isDone = g => isNotPlayed(g) || isWatched(g.id, g.league) || isDismissed(g.id, g.league)
    const watchedAt = Object.values(watchedGames)
      .filter(w => (w.league === 'cricket' || w.league === 'bbl') && w.watched && w.updatedAt)
      .map(w => new Date(w.updatedAt).getTime())

    const plan = paceToDeadline(items, isDone, watchedAt, yearEnd, now)
    // The card's date line reads "Year ends Thu, Dec 31", so show the last day.
    return { ...plan, start: new Date(yearEnd.getTime() - 1), labels: LABELS }
  }, [cricketGames, bblGames, watchedGames, isWatched, isDismissed])
}
