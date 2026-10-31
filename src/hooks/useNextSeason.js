import { useEffect, useMemo, useState } from 'react'
import { fetchNextOpener } from '../api/nextSeason'
import { isSeasonInProgress } from './useSeasonFilter'

/**
 * The next season's opener for a league that's between seasons, or null while
 * a season is running (or the league's games are still loading).
 *
 * If the loaded schedule already holds upcoming games (the new season's
 * fixtures are out but nothing's been played), the earliest of those is the
 * opener. Otherwise it's looked up from the source that publishes next season
 * first (src/api/nextSeason.js).
 */
export function useNextSeason(league, games, loading = false) {
  const inSeason = useMemo(() => isSeasonInProgress(league, games), [league, games])

  const fromSchedule = useMemo(() => {
    if (loading || inSeason) return null
    const next = (games ?? [])
      .filter(g => g.status === 'scheduled' && g.gameDate)
      .sort((a, b) => a.gameDate - b.gameDate)[0]
    return next ? { date: next.gameDate, dateOnly: !!next.timeTBD, estimated: false, label: 'Season opener' } : null
  }, [games, loading, inSeason])

  const [fetched, setFetched] = useState({ league: null, opener: null })
  const needsFetch = !loading && !inSeason && !fromSchedule

  useEffect(() => {
    if (!needsFetch) return
    let cancelled = false
    fetchNextOpener(league).then(opener => { if (!cancelled) setFetched({ league, opener }) })
    return () => { cancelled = true }
  }, [league, needsFetch])

  if (!needsFetch) return fromSchedule
  return fetched.league === league ? fetched.opener : null
}
