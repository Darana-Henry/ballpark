import { fetchMLBGames } from './mlb'
import { fetchNBAGames, fetchNFLGames } from './espn'
import { fetchMLSGames } from './mls'
import { fetchEPLGames } from './epl'

// Counting "games played so far" needs each league's schedule, which Home
// already loads on every visit. The promises are memoised for the session so
// the Stats page reuses that work instead of paying for it a second time —
// EPL alone is a dozen requests per competition.
//
// Only the keyless leagues are here; BBL and international cricket need the
// user's CricAPI key and are fetched by the views that hold it.
const FETCHERS = {
  mlb: fetchMLBGames,
  nba: fetchNBAGames,
  nfl: fetchNFLGames,
  mls: fetchMLSGames,
  epl: fetchEPLGames,
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
