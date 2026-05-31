import { createContext, useContext } from 'react'
import { useWatchedGames } from '../hooks/useWatchedGames'

const WatchedContext = createContext(null)

export function WatchedProvider({ children }) {
  const state = useWatchedGames()
  return <WatchedContext.Provider value={state}>{children}</WatchedContext.Provider>
}

export function useWatched() {
  const ctx = useContext(WatchedContext)
  if (!ctx) throw new Error('useWatched must be used within WatchedProvider')
  return ctx
}
