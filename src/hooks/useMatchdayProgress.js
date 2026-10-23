import { useState, useEffect, useCallback } from 'react'
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'

// How far through each competition's league phase the user has watched, as
// the last matchday they've marked done. One doc per competition per season
// (`ucl_2026`), so a new season starts from scratch without any cleanup.
// Without Firebase the progress lives in memory for the session only, shared
// across every component using the hook (the sidebar battery and the Europe
// tab) the way a Firestore snapshot would be.
let memoryProgress = {}
const memoryListeners = new Set()

export function useMatchdayProgress() {
  const [progress, setProgress] = useState(() => (isFirebaseConfigured ? {} : memoryProgress))

  useEffect(() => {
    if (!isFirebaseConfigured) {
      memoryListeners.add(setProgress)
      return () => memoryListeners.delete(setProgress)
    }

    const unsub = onSnapshot(
      collection(db, 'matchdayProgress'),
      (snap) => {
        const next = {}
        snap.forEach(d => { next[d.id] = d.data() })
        setProgress(next)
      },
      (err) => console.error('Firestore error (matchdayProgress):', err)
    )
    return unsub
  }, [])

  const watchedThrough = useCallback((competition, season) => {
    return progress[`${competition}_${season}`]?.watchedThrough ?? 0
  }, [progress])

  const setWatchedThrough = useCallback(async (competition, season, matchday) => {
    const id = `${competition}_${season}`
    const record = { competition, season, watchedThrough: matchday, updatedAt: new Date().toISOString() }
    if (!isFirebaseConfigured) {
      memoryProgress = { ...memoryProgress, [id]: record }
      memoryListeners.forEach(notify => notify(memoryProgress))
      return
    }
    await setDoc(doc(db, 'matchdayProgress', id), record)
  }, [])

  return { watchedThrough, setWatchedThrough }
}
