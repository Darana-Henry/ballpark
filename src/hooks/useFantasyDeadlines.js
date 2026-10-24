import { useState, useEffect } from 'react'
import { FANTASY_LEAGUES } from '../constants/fantasyLeagues'
import deadlineData from '../data/fantasyDeadlines.json'

// Written at deploy time by scripts/fetch-fantasy-deadlines.mjs, which also
// builds the subscribable calendar from the same rounds. Sorted by deadline,
// not round number: a postponed round (Eliteserien's Runde 12, say) can lock
// after later-numbered ones.
const ROUNDS = Object.fromEntries(FANTASY_LEAGUES.map(league => [
  league.id,
  (deadlineData.leagues[league.id]?.rounds ?? [])
    .map(r => ({ ...r, deadline: new Date(r.deadline) }))
    .sort((a, b) => a.deadline - b.deadline),
]))

export const DEADLINES_UPDATED_AT = new Date(deadlineData.generatedAt)

// Returns one entry per fantasy league — { league, nextRound, loading, failed }
// — sorted soonest-deadline-first, with leagues that have no upcoming round
// pushed to the end. Shared by DeadlinesView and the Home deadline strip.
// `loading` is always false now the data ships with the build; it stays in
// the shape so callers don't need to change.
export function useFantasyDeadlines() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const cards = FANTASY_LEAGUES.map(league => {
    const rounds = ROUNDS[league.id]
    const failed = rounds.length === 0
    const nextRound = rounds.find(r => r.deadline.getTime() > now) ?? null
    return { league, nextRound, loading: false, failed }
  })

  return cards.sort((a, b) => {
    if (!!a.nextRound !== !!b.nextRound) return a.nextRound ? -1 : 1
    if (a.nextRound && b.nextRound) return a.nextRound.deadline - b.nextRound.deadline
    return 0
  })
}
