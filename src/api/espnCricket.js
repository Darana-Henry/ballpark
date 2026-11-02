// ESPN's public cricket API (it serves Cricinfo's data, and unlike Cricinfo's
// own API answers browsers). Keyed by the Cricinfo match id that the
// Wikipedia scorecards link to, which is the id most international games
// carry. The league segment of the path isn't checked, so a fixed one does.
//
// The boundary tracker reads three things from a match's summary: the toss,
// the playing XIs (role, wicketkeeper, debut) and the captains, flagged in
// the XIs so a stand-in shows rather than the tour squad's named one. All are
// there once the teams are announced at the toss. The same response carries
// live notes and scores; nothing else is read from it, so nothing is spoiled.

const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/cricket/8676/summary'

async function getSummary(matchId, retried = false) {
  const res = await fetch(`${SUMMARY}?event=${matchId}`)
  // ESPN answers the odd request with a 5xx; one retry clears most.
  if (res.status >= 500 && !retried) return getSummary(matchId, true)
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`)
  return res.json()
}

const ROLE = { WK: 'Wicketkeeper', AR: 'All-rounder', BL: 'Bowler' }

// "India , elected to bat first" → "India won the toss and chose to bat first"
function tossText(notes) {
  const raw = notes?.find(n => n.type === 'toss')?.text
  if (!raw) return null
  const [team, decision] = raw.split(/\s*,\s*/)
  if (!decision) return raw
  return `${team} won the toss and ${decision.replace(/^elected/, 'chose')}`
}

const EMPTY = { captains: {}, toss: null, xis: {} }
const cache = new Map()

/**
 * `{ captains: { team: name }, toss: string | null, xis: { team: [{ name,
 * role, captain, keeper, debut }] } }` for one match, empty until the XIs are
 * out (or for an id ESPN doesn't know). Team keys are ESPN's display names,
 * which match the app's nation names.
 */
export function fetchMatchSummary(matchId) {
  if (!/^\d+$/.test(String(matchId ?? ''))) return Promise.resolve(EMPTY)
  if (!cache.has(matchId)) {
    const run = getSummary(matchId)
      .then(data => {
        const debuts = new Set((data.debuts ?? []).flatMap(d => (d.roster ?? []).map(p => p.athlete?.id)))
        const xis = {}, captains = {}
        for (const r of data.rosters ?? []) {
          const team = r.team?.displayName
          if (!team) continue
          xis[team] = (r.roster ?? []).map(p => ({
            name: p.athlete?.displayName ?? '?',
            role: ROLE[p.position?.abbreviation] ?? 'Batter',
            keeper: p.position?.abbreviation === 'WK',
            captain: !!p.captain,
            debut: debuts.has(p.athlete?.id),
          }))
          const c = xis[team].find(p => p.captain)
          if (c) captains[team] = c.name
        }
        return { captains, toss: tossText(data.notes), xis }
      })
      .catch(() => EMPTY)
    cache.set(matchId, run)
  }
  return cache.get(matchId)
}
