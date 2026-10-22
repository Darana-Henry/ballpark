import { createContext, useContext } from 'react'
import { useWatchedGames } from '../hooks/useWatchedGames'
import { useHighlightLinks } from '../hooks/useHighlightLinks'

const WatchedContext = createContext(null)

export function WatchedProvider({ children }) {
  const watched = useWatchedGames()
  const links = useHighlightLinks()
  const state = { ...watched, ...links }
  return <WatchedContext.Provider value={state}>{children}</WatchedContext.Provider>
}

export function useWatched() {
  const ctx = useContext(WatchedContext)
  if (!ctx) throw new Error('useWatched must be used within WatchedProvider')
  return ctx
}
