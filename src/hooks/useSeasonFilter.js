import { useMemo, useState } from 'react'
import { useWatched } from '../contexts/WatchedContext'
import { getAvailableSeasons, getCurrentSeasonYear, getSeasonYear } from '../utils/season'

// A season is under way once its first game is played and until its last
// scheduled game (playoffs included) is final. Before the opener and after the
// final there's nothing current to look at, so the filter starts on All.
export function isSeasonInProgress(league, games, now = new Date()) {
  const current = getCurrentSeasonYear(league, now)
  const thisSeason = (games ?? []).filter(g => g.gameDate && getSeasonYear(league, g.gameDate) === current)
  return thisSeason.some(g => g.status !== 'scheduled') && thisSeason.some(g => g.status !== 'final')
}

/**
 * Season filter state for a league's Standings and Stats tabs. It opens on the
 * current season while one is under way, otherwise on All, and follows that
 * default (games load after the first render) until the user picks a season.
 * The current season is always offered while it's running, even before any of
 * its games are watched.
 */
export function useSeasonFilter(league, games) {
  const { watchedGames } = useWatched()
  const [picked, setSeasonFilter] = useState(null)

  const inProgress = useMemo(() => isSeasonInProgress(league, games), [league, games])
  const current = getCurrentSeasonYear(league)

  const availableSeasons = useMemo(() => {
    const seasons = getAvailableSeasons(watchedGames, league)
    if (inProgress && !seasons.includes(current)) seasons.unshift(current)
    return seasons
  }, [watchedGames, league, inProgress, current])

  const seasonFilter = picked ?? (inProgress ? current : 'all')
  return { seasonFilter, setSeasonFilter, availableSeasons }
}
