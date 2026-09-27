import {
  doc, getDoc, setDoc, collection, getDocs, writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'
import {
  INTL_NATIONS, NATION_ABBR, NATIONS, computeDifficulty, resolveWinner, formatInnings,
} from '../utils/cricketMatch'
import { fetchWikiCricketGames } from './wikiCricket'

// Re-exported so existing view imports keep working.
export { NATIONS, NATION_ABBR }

// International cricket schedule, results and scores come from Wikipedia (see
// src/api/wikiCricket.js). This module owns caching: a per-tab session copy,
// a shared Firestore copy, and deciding when that copy is stale enough to
// re-read Wikipedia. Wikipedia has no quota, so refreshes happen
// automatically instead of waiting for the Update button.

// Stored as one summary document plus one document of games per series start
// year — two years of whole series with every tournament game is too close
// to Firestore's 1 MB-per-document limit to keep in one.
const CACHE_COLLECTION = 'intlCricketCache'
const META_DOC = 'current'
const yearDoc = y => `games-${y}`
const SOURCE = 'wikipedia'
// Bumped when stored games change in a way the tabs rely on (2: seriesKind
// and seriesTeams; 3: tournaments keep every game, not just tracked nations';
// 4: whole series from last year and this year, grouped by start year), so an
// older stored copy is refreshed instead of shown.
const SCHEMA = 4

// Series starting in this many previous years are kept alongside this
// year's, so the Series tab can show last year and tours that cross New
// Year stay whole.
const YEARS_BACK = 1

// How old the stored copy may get before a load triggers a refresh — much
// shorter while a match is in progress, since editors update scores live.
const STALE_MS      = 30 * 60 * 1000
const LIVE_STALE_MS =  5 * 60 * 1000

// ─── Session cache ─────────────────────────────────────────────────────────────

const SESSION_KEY = 'ballpark_intlcricket_session_v6'

// Dates come back from Firestore as Timestamps and from sessionStorage as
// ISO strings.
const toDate = v => (v == null ? null : v.toDate ? v.toDate() : new Date(v))
function reviveDates(g) {
  return { ...g, gameDate: toDate(g.gameDate), endDate: toDate(g.endDate), seriesStart: toDate(g.seriesStart) }
}

function readSession() {
  try {
    const c = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    if (!c) return null
    return { games: c.games.map(reviveDates), updatedAt: toDate(c.updatedAt) }
  } catch { return null }
}
function writeSession({ games, updatedAt }) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ games, updatedAt })) } catch { /* storage full or blocked */ }
}

// ─── Firestore ─────────────────────────────────────────────────────────────────

async function loadFromFirestore() {
  if (!isFirebaseConfigured) return null
  try {
    const snap = await getDoc(doc(db, CACHE_COLLECTION, META_DOC))
    if (!snap.exists()) return null
    const { games: legacyGames = [], years, updatedAt, source, schema, watchedMigrated } = snap.data()
    // Copies saved before the per-year split kept games in the summary doc.
    let games = legacyGames
    if (years?.length) {
      const docs = await Promise.all(years.map(y => getDoc(doc(db, CACHE_COLLECTION, yearDoc(y)))))
      games = docs.flatMap(d => (d.exists() ? d.data().games ?? [] : []))
    }
    return {
      source: source ?? null,
      schema: schema ?? 1,
      watchedMigrated: !!watchedMigrated,
      updatedAt: toDate(updatedAt),
      games: games.map(reviveDates),
    }
  } catch { return null }
}

async function saveToFirestore(games, { watchedMigrated }) {
  if (!isFirebaseConfigured) return
  try {
    const byYear = new Map()
    for (const g of games) {
      const y = g.seriesStart.getUTCFullYear()
      if (!byYear.has(y)) byYear.set(y, [])
      byYear.get(y).push(g)
    }
    const years = [...byYear.keys()].sort()
    // Year docs first, so the summary never points at games not yet written.
    await Promise.all(years.map(y => setDoc(doc(db, CACHE_COLLECTION, yearDoc(y)), { games: byYear.get(y) })))
    await setDoc(doc(db, CACHE_COLLECTION, META_DOC), {
      source: SOURCE,
      schema: SCHEMA,
      watchedMigrated,
      years,
      updatedAt: new Date(),
    })
  } catch (e) { console.warn('IntlCricket Firestore write failed:', e.message) }
}

// ─── Watched-mark migration ────────────────────────────────────────────────────
// Before the switch to Wikipedia, matches were keyed by CricAPI's UUIDs, and
// watched/dismissed marks are stored under `cricket_<matchId>` (plus `_d<n>`
// for a Test's day rows). Wikipedia games are keyed by Cricinfo match id, so
// each old mark is re-pointed at the same match — found by teams, format
// ordinal and date — and the original is kept in watchedGamesBackup.

const CRICAPI_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
const DAY = 86400000

function findMigrationTarget(mark, baseGameType, byTeams) {
  const teams = [mark.homeTeam, mark.awayTeam].sort().join('|')
  const markDate = new Date(mark.gameDate)
  const candidates = (byTeams.get(teams) || [])
    .map(g => ({ g, diff: Math.abs(g.gameDate - markDate) }))
    .filter(c => c.diff <= 3 * DAY)

  // Old labels carry the ordinal ("2nd T20I") — the most reliable key, since
  // CricAPI's GMT start times can land on the neighbouring calendar day.
  const byLabel = candidates.filter(c => c.g.gameType === baseGameType)
  if (byLabel.length === 1) return byLabel[0].g

  const close = candidates.filter(c => c.diff <= 1.5 * DAY).sort((a, b) => a.diff - b.diff)
  if (close.length === 1 || (close.length > 1 && close[1].diff - close[0].diff >= DAY)) return close[0].g
  return null
}

async function migrateWatchedMarks(games) {
  const snap = await getDocs(collection(db, 'watchedGames'))
  const byTeams = new Map()
  for (const g of games) {
    const key = [g.homeTeam.name, g.awayTeam.name].sort().join('|')
    if (!byTeams.has(key)) byTeams.set(key, [])
    byTeams.get(key).push(g)
  }

  let batch = writeBatch(db), ops = 0, migrated = 0
  const unmatched = []
  const flush = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0 } }

  for (const d of snap.docs) {
    const mark = d.data()
    if (mark.league !== 'cricket' || !CRICAPI_ID.test(String(mark.gameId))) continue

    const [, oldBase, dayNum] = String(mark.gameId).match(/^(.*?)(?:_d(\d+))?$/)
    const baseGameType = (mark.gameType || '').replace(/ · Day \d+$/, '')
    // Day rows store that day's date; step back to the Test's first day.
    const startDate = dayNum ? new Date(new Date(mark.gameDate).getTime() - (dayNum - 1) * DAY) : mark.gameDate
    const target = findMigrationTarget({ ...mark, gameDate: startDate }, baseGameType, byTeams)
    if (!target) { unmatched.push(`${mark.homeTeam} v ${mark.awayTeam} ${mark.gameType} (${oldBase})`); continue }

    const newGameId = dayNum ? `${target.id}_d${dayNum}` : target.id
    batch.set(doc(db, 'watchedGamesBackup', d.id), mark)
    batch.set(doc(db, 'watchedGames', `cricket_${newGameId}`), {
      ...mark, gameId: newGameId, gameType: dayNum ? `${target.gameType} · Day ${dayNum}` : target.gameType, migratedFrom: mark.gameId,
    })
    batch.delete(d.ref)
    ops += 3
    migrated++
    if (ops >= 450) await flush()
  }
  await flush()
  if (unmatched.length) console.warn('IntlCricket: watched marks with no Wikipedia match (left as-is):', unmatched)
  return { migrated, unmatched: unmatched.length }
}

// ─── Live overlay (CricAPI) ────────────────────────────────────────────────────
// Wikipedia editors keep live scorecards fairly current, but not ball by ball.
// When a CricAPI key is available and a match should be in progress, one
// currentMatches call covers every live international and is laid over the
// Wikipedia data. The key's 100 calls/day are shared with the BBL and WTC
// tabs, so calls are spaced out and stop once the day's usage (which CricAPI
// reports in every response) reaches LIVE_HITS_CEILING.

const CRICAPI_BASE = 'https://api.cricapi.com/v1'
const LIVE_STATE_KEY = 'ballpark_cricapi_live_v1'
const LIVE_MIN_INTERVAL_MS = 15 * 60 * 1000
const LIVE_HITS_CEILING = 60
const CRICAPI_MATCH_TYPES = { test: 'test', odi: 'odi', t20: 't20i', t20i: 't20i' }

function cricApiKey() {
  try {
    return import.meta.env.VITE_CRICAPI_KEY || localStorage.getItem('cricapi_key') || ''
  } catch {
    return import.meta.env.VITE_CRICAPI_KEY || ''
  }
}

function readLiveState() {
  try { return JSON.parse(localStorage.getItem(LIVE_STATE_KEY) || 'null') } catch { return null }
}
function writeLiveState(state) {
  try { localStorage.setItem(LIVE_STATE_KEY, JSON.stringify(state)) } catch { /* storage full or blocked */ }
}

function inPlayWindow(game, now = Date.now()) {
  if (game.status === 'final') return false
  if (game.status === 'live') return true
  const start = game.gameDate.getTime() - DAY / 2
  const days = game.matchType === 'test' ? 5 : 1
  return start <= now && now <= start + days * DAY
}

// Returns CricAPI's current matches — from the last call if it's recent
// enough, otherwise from a new call when the budget allows. null when there's
// no key, nothing to overlay, or the budget is spent.
async function getLiveMatches(games) {
  const key = cricApiKey()
  if (!key || !games.some(g => inPlayWindow(g))) return null

  const state = readLiveState()
  const today = new Date().toISOString().slice(0, 10)
  if (state && Date.now() - state.fetchedAt < LIVE_MIN_INTERVAL_MS) return state.matches
  if (state?.day === today && state.hitsToday >= LIVE_HITS_CEILING) return null

  try {
    const res = await fetch(`${CRICAPI_BASE}/currentMatches?offset=0&apikey=${key}`)
    const json = await res.json()
    if (!res.ok || json.status !== 'success') return null
    const matches = (json.data || [])
      .filter(m => m.matchStarted && (m.teams || []).every(t => INTL_NATIONS.has(t)))
      .map(({ teams, matchType, status, dateTimeGMT, matchEnded, score }) => ({ teams, matchType, status, dateTimeGMT, matchEnded, score }))
    writeLiveState({ fetchedAt: Date.now(), day: today, hitsToday: json.info?.hitsToday ?? 0, matches })
    return matches
  } catch {
    return null
  }
}

function inningsFor(score, team) {
  return (score || [])
    .filter(s => (s.inning || '').toLowerCase().startsWith(team.toLowerCase()))
    .map(s => ({ r: parseInt(s.r) || 0, w: parseInt(s.w) || 0, o: parseFloat(s.o) || 0 }))
}

// Lays CricAPI's live state over matching Wikipedia games (same teams, format
// and start date). A result Wikipedia already has always wins; a match
// CricAPI has seen finish shows as final until Wikipedia catches up.
function applyLiveOverlay(games, liveMatches) {
  if (!liveMatches?.length) return games
  return games.map(game => {
    if (game.status === 'final') return game
    const live = liveMatches.find(m =>
      CRICAPI_MATCH_TYPES[(m.matchType || '').toLowerCase()] === game.matchType &&
      [...m.teams].sort().join('|') === [game.homeTeam.name, game.awayTeam.name].sort().join('|') &&
      Math.abs(new Date(`${m.dateTimeGMT}Z`) - game.gameDate) <= 1.5 * DAY)
    if (!live) return game

    const isTest = game.matchType === 'test'
    const homeInnings = inningsFor(live.score, game.homeTeam.name)
    const awayInnings = inningsFor(live.score, game.awayTeam.name)
    const winner = live.matchEnded ? resolveWinner(live.status, game.homeTeam.name, game.awayTeam.name) : null
    return {
      ...game,
      liveSource:   'cricapi',
      status:       live.matchEnded ? 'final' : 'live',
      statusDetail: live.status || game.statusDetail,
      homeInnings, awayInnings,
      homeScoreStr: formatInnings(homeInnings, isTest),
      awayScoreStr: formatInnings(awayInnings, isTest),
      homeWon:      winner === 'home',
      awayWon:      winner === 'away',
      difficulty:   live.matchEnded ? computeDifficulty(live.status, game.matchType) : null,
    }
  })
}

// ─── Refresh ───────────────────────────────────────────────────────────────────

function isStale(cached) {
  if (!cached?.games?.length || cached.source !== SOURCE || !cached.updatedAt) return true
  if ((cached.schema ?? SCHEMA) !== SCHEMA) return true
  const age = Date.now() - cached.updatedAt.getTime()
  const hasLive = cached.games.some(g => g.status === 'live')
  return age >= (hasLive ? LIVE_STALE_MS : STALE_MS)
}

let inFlight = null

async function runRefresh() {
  const existing = await loadFromFirestore()
  const previous = existing?.source === SOURCE ? existing.games : []
  const year = new Date().getFullYear()

  const { games: allGames, articlesFetched, newResults } = await fetchWikiCricketGames({ year, fromYear: year - YEARS_BACK, previous })
  const liveMatches = await getLiveMatches(allGames)
  // A finish CricAPI reported earlier is kept until Wikipedia posts the result.
  const previousById = new Map(previous.map(g => [g.id, g]))
  const games = applyLiveOverlay(allGames, liveMatches)
    .map(g => {
      const prev = previousById.get(g.id)
      return g.status !== 'final' && prev?.liveSource === 'cricapi' && prev.status === 'final' ? prev : g
    })

  let watchedMigrated = !!existing?.watchedMigrated
  let migration = null
  if (!watchedMigrated && isFirebaseConfigured) {
    try {
      migration = await migrateWatchedMarks(allGames)
      watchedMigrated = true
    } catch (e) {
      console.warn('IntlCricket watched-mark migration failed (will retry next refresh):', e.message)
    }
  }

  await saveToFirestore(games, { watchedMigrated })
  const result = { games, updatedAt: new Date() }
  writeSession(result)
  return { ...result, articlesFetched, newResults, migration }
}

// Re-reads Wikipedia now. Concurrent callers (Home, Stats and the Cricket tab
// loading together) share one refresh instead of each starting their own.
export function refreshIntlCricketGames() {
  if (!inFlight) inFlight = runRefresh().finally(() => { inFlight = null })
  return inFlight
}

// ─── Public API ────────────────────────────────────────────────────────────────

// Returns the stored schedule, refreshing it from Wikipedia first when it's
// stale. If Wikipedia can't be reached, the stored copy is returned as-is.
export async function fetchIntlCricketGames() {
  const session = readSession()
  if (session && !isStale({ ...session, source: SOURCE, schema: SCHEMA })) return session

  const cached = await loadFromFirestore()
  if (cached && !isStale(cached)) {
    const result = { games: cached.games, updatedAt: cached.updatedAt }
    writeSession(result)
    return result
  }

  try {
    const { games, updatedAt } = await refreshIntlCricketGames()
    return { games, updatedAt }
  } catch (e) {
    if (cached?.source === SOURCE && cached.games.length) {
      console.warn('IntlCricket refresh failed, showing stored copy:', e.message)
      return { games: cached.games, updatedAt: cached.updatedAt, refreshError: e.message }
    }
    throw e
  }
}
