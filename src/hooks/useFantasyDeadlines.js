import { useState, useEffect } from 'react'
import { FANTASY_LEAGUES } from '../constants/fantasyLeagues'
import { FANTASY_DEADLINES } from '../constants/fantasyDeadlines'
import { fetchBundesligaDeadlines, fetchSerieADeadlines } from '../api/fantasyFixtures'

const DYNAMIC_FETCHERS = {
  bundesliga: fetchBundesligaDeadlines,
  serieA: fetchSerieADeadlines,
}

// Returns one entry per fantasy league — { league, nextRound, loading, failed }
// — sorted soonest-deadline-first, with loading/no-upcoming-round leagues
// pushed to the end. Shared by DeadlinesView and the Home deadline strip so
// the fetch + matchday clustering only happens once per mount site.
export function useFantasyDeadlines() {
  const [dynamicRounds, setDynamicRounds] = useState({ bundesliga: null, serieA: null })
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    Object.entries(DYNAMIC_FETCHERS).forEach(([id, fetchFn]) => {
      fetchFn().then(rounds => {
        if (!cancelled) setDynamicRounds(prev => ({ ...prev, [id]: rounds }))
      })
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const cards = FANTASY_LEAGUES.map(league => {
    const loading = league.type === 'dynamic' && dynamicRounds[league.id] === null
    const rounds = league.type === 'dynamic' ? (dynamicRounds[league.id] ?? []) : FANTASY_DEADLINES[league.id]
    const failed = league.type === 'dynamic' && !loading && rounds.length === 0
    const nextRound = !loading && !failed
      ? [...rounds].sort((a, b) => a.deadline - b.deadline).find(r => r.deadline.getTime() > now) ?? null
      : null
    return { league, nextRound, loading, failed }
  })

  return cards.sort((a, b) => {
    if (a.loading !== b.loading) return a.loading ? 1 : -1
    if (!!a.nextRound !== !!b.nextRound) return a.nextRound ? -1 : 1
    if (a.nextRound && b.nextRound) return a.nextRound.deadline - b.nextRound.deadline
    return 0
  })
}
