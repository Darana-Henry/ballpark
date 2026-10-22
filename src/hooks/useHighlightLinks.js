import { useState, useEffect, useCallback } from 'react'
import {
  collection, onSnapshot, doc, setDoc, deleteDoc
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'

// User-pasted highlight links, one per game. Kept in their own collection
// rather than on the watchedGames doc, because un-watching or un-dismissing
// deletes that doc outright and would take the link with it.
export function useHighlightLinks() {
  const [links, setLinks] = useState({})

  useEffect(() => {
    if (!isFirebaseConfigured) return

    const unsub = onSnapshot(
      collection(db, 'highlightLinks'),
      (snap) => {
        const next = {}
        snap.forEach(d => { next[d.id] = d.data() })
        setLinks(next)
      },
      (err) => console.error('Firestore error (highlightLinks):', err)
    )
    return unsub
  }, [])

  const getHighlightLink = useCallback((gameId, league) => {
    return links[`${league}_${gameId}`]?.url ?? null
  }, [links])

  const saveHighlightLink = useCallback(async (game, url) => {
    if (!isFirebaseConfigured) return
    await setDoc(doc(db, 'highlightLinks', `${game.league}_${game.id}`), {
      url,
      league: game.league,
      gameId: game.id,
      homeTeam: game.homeTeam.name,
      awayTeam: game.awayTeam.name,
      gameDate: game.gameDate?.toISOString() || null,
      savedAt: new Date().toISOString(),
    })
  }, [])

  const removeHighlightLink = useCallback(async (game) => {
    if (!isFirebaseConfigured) return
    await deleteDoc(doc(db, 'highlightLinks', `${game.league}_${game.id}`))
  }, [])

  return { getHighlightLink, saveHighlightLink, removeHighlightLink }
}
