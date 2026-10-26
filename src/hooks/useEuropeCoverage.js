import { useState, useEffect, useMemo } from 'react'
import { EUROPE_COMPETITIONS, loadMatchdays, getSeason } from '../api/europe'
import { watchCoverage } from '../utils/leaguePhase'

// Season coverage for each competition in the Europe tab, plus all of them
// combined for the sidebar battery. `watchedThrough` comes from
// useMatchdayProgress. Fixtures share the session cache the Europe tab uses,
// so this costs no extra requests once either has loaded.
export function useEuropeCoverage(watchedThrough) {
  const [matchdaysById, setMatchdaysById] = useState({})

  useEffect(() => {
    let cancelled = false
    for (const c of EUROPE_COMPETITIONS) {
      loadMatchdays(c)
        .then(matchdays => {
          if (!cancelled) setMatchdaysById(m => ({ ...m, [c.id]: matchdays }))
        })
        .catch(() => {})
    }
    return () => { cancelled = true }
  }, [])

  return useMemo(() => {
    const season = getSeason()
    const byCompetition = {}
    const combined = { total: 0, played: 0, watched: 0, watchedPlayed: 0 }
    for (const c of EUROPE_COMPETITIONS) {
      const matchdays = matchdaysById[c.id]
      if (!matchdays) continue
      const cov = watchCoverage(matchdays, watchedThrough(c.id, season))
      byCompetition[c.id] = cov
      for (const k of Object.keys(combined)) combined[k] += cov[k]
    }
    return { byCompetition, combined }
  }, [matchdaysById, watchedThrough])
}
