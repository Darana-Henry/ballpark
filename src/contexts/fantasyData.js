import { createContext, useContext } from 'react'

// The fantasy league on screen: `{ league, data, history }`, where `data` is
// src/data/<league>Players.json and `history` src/data/<league>History.json.
// Provided by FantasyLeagueView, so every panel works for any league.
export const FantasyDataContext = createContext(null)

export const useFantasyData = () => useContext(FantasyDataContext)

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
