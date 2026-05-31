import { useState, useEffect, useCallback } from 'react'
import {
  collection, onSnapshot, doc, setDoc, deleteDoc
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'

export function useWatchedGames() {
  const [watchedGames, setWatchedGames] = useState({})
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isFirebaseConfigured) return

    const unsub = onSnapshot(
      collection(db, 'watchedGames'),
      (snap) => {
        const games = {}
        snap.forEach(d => { games[d.id] = d.data() })
        setWatchedGames(games)
        setLoading(false)
      },
      (err) => {
        console.error('Firestore error:', err)
        setError(err.message)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  function gamePayload(game, extra) {
    return {
      league: game.league,
      gameId: game.id,
      homeTeam: game.homeTeam.name,
      awayTeam: game.awayTeam.name,
      homeTeamId: game.homeTeam.id,
      awayTeamId: game.awayTeam.id,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      gameDate: game.gameDate?.toISOString() || null,
      status: game.status,
      gameType: game.gameType,
      updatedAt: new Date().toISOString(),
      ...extra,
    }
  }

  const toggleWatched = useCallback(async (game) => {
    if (!isFirebaseConfigured) return
    const docId = `${game.league}_${game.id}`
    const ref = doc(db, 'watchedGames', docId)
    if (watchedGames[docId]?.watched) {
      await deleteDoc(ref)
    } else {
      await setDoc(ref, gamePayload(game, { watched: true, dismissed: false }))
    }
  }, [watchedGames])

  const toggleDismissed = useCallback(async (game) => {
    if (!isFirebaseConfigured) return
    const docId = `${game.league}_${game.id}`
    const ref = doc(db, 'watchedGames', docId)
    if (watchedGames[docId]?.dismissed) {
      await deleteDoc(ref)
    } else {
      await setDoc(ref, gamePayload(game, { dismissed: true, watched: false }))
    }
  }, [watchedGames])

  const isWatched = useCallback((gameId, league) => {
    return !!watchedGames[`${league}_${gameId}`]?.watched
  }, [watchedGames])

  const isDismissed = useCallback((gameId, league) => {
    return !!watchedGames[`${league}_${gameId}`]?.dismissed
  }, [watchedGames])

  const watchedForLeague = useCallback((league) => {
    return Object.values(watchedGames).filter(g => g.league === league && g.watched)
  }, [watchedGames])

  return { watchedGames, loading, error, toggleWatched, toggleDismissed, isWatched, isDismissed, watchedForLeague }
}
