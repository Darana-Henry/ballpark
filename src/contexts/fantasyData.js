import { createContext, useContext } from 'react'

// The fantasy league on screen: `{ league, data, history }`, where `data` is
// src/data/<league>Players.json and `history` src/data/<league>History.json.
// Provided by FantasyLeagueView, so every panel works for any league.
export const FantasyDataContext = createContext(null)

export const useFantasyData = () => useContext(FantasyDataContext)

/**
 * The league's round abbreviation and currency ("GW" and "£" unless it sets
 * its own), and `K`, what its doubled players are called: "captain", or
 * "star players" where three score 1.5× (the Bundesliga).
 */
export function useLabels() {
  const { league, data } = useContext(FantasyDataContext)
  return {
    R: league?.roundShort ?? 'GW',
    C: league?.currency ?? '£',
    K: data?.rules?.captaincy === 'stars' ? 'star players' : 'captain',
  }
}

// Wraps a function of a league's data so it runs once per data file: panels
// derive lookup tables and tables from the data, and the data never changes
// while the page is open.
export function perLeague(fn) {
  const cache = new WeakMap()
  return data => {
    if (!cache.has(data)) cache.set(data, fn(data))
    return cache.get(data)
  }
}
