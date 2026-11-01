import { useMemo } from 'react'
import { useWatched } from '../contexts/WatchedContext'
import { catchUpPlan } from '../utils/catchUp'

/** The NFL catch-up plan (src/utils/catchUp.js) from the user's watched games; null once the playoffs start. */
export function useCatchUpPlan(games) {
  const { watchedGames, isWatched, isDismissed } = useWatched()
  return useMemo(() => {
    const watchedAt = Object.values(watchedGames)
      .filter(w => w.league === 'nfl' && w.watched && w.updatedAt)
      .map(w => new Date(w.updatedAt).getTime())
    return catchUpPlan(games, g => isWatched(g.id, 'nfl') || isDismissed(g.id, 'nfl'), watchedAt)
  }, [games, watchedGames, isWatched, isDismissed])
}
