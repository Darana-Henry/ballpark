import { fetchMLBGames } from './mlb'
import { fetchNBAGames, fetchNFLGames } from './espn'
import { fetchMLSGames } from './mls'
import { fetchEPLGames } from './epl'
import { fetchBBLGames } from './bbl'
import { fetchIntlCricketGames } from './intlCricket'
import { seriesActiveInYear } from '../utils/cricketMatch'

// Counting "games played so far" needs each league's schedule, which Home
// already loads on every visit. The promises are memoised for the session so
// the Stats page reuses that work instead of paying for it a second time —
// EPL alone is a dozen requests per competition.
//
// BBL needs the user's CricAPI key; without one it simply resolves empty, and
// anything reading it shows no season total. International cricket comes from
// Wikipedia and needs no key.
const cricApiKey = () => {
  try {
    return import.meta.env.VITE_CRICAPI_KEY || localStorage.getItem('cricapi_key') || ''
  } catch {
    return import.meta.env.VITE_CRICAPI_KEY || ''
  }
}

const withKey = fn => () => {
  const key = cricApiKey()
  return key ? fn(key) : Promise.resolve([])
}

const FETCHERS = {
  mlb: fetchMLBGames,
  nba: fetchNBAGames,
  nfl: fetchNFLGames,
  mls: fetchMLSGames,
  epl: fetchEPLGames,
  bbl: withKey(fetchBBLGames),
  // Stored cricket spans last year's series too; the season is this year's.
  cricket: () => fetchIntlCricketGames().then(r => ({ ...r, games: seriesActiveInYear(r.games) })),
}

export const SCHEDULED_LEAGUES = Object.keys(FETCHERS)

const cache = new Map()

// A failed league resolves to an empty list rather than rejecting, so one
// league being down never blanks the whole page.
export function loadLeagueGames(league) {
  if (!FETCHERS[league]) return Promise.resolve([])
  if (!cache.has(league)) {
    cache.set(league, FETCHERS[league]().then(r => (Array.isArray(r) ? r : r?.games ?? [])).catch(() => []))
  }
  return cache.get(league)
}

export async function loadAllLeagueGames() {
  const entries = await Promise.all(
    SCHEDULED_LEAGUES.map(async league => [league, await loadLeagueGames(league)])
  )
  return Object.fromEntries(entries)
}
