import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'
import { INTL_CRICKET_SERIES_2026 } from '../data/intlCricketSeries2026'

const BASE = 'https://api.cricapi.com/v1'

const INTL_NATIONS = new Set([
  'England', 'South Africa', 'Australia', 'New Zealand',
  'India', 'Pakistan', 'West Indies', 'Sri Lanka',
  'Bangladesh', 'Zimbabwe', 'Afghanistan', 'Ireland',
])

export const NATION_ABBR = {
  'England':      'ENG', 'South Africa': 'SA',  'Australia':    'AUS',
  'New Zealand':  'NZ',  'India':        'IND', 'Pakistan':     'PAK',
  'West Indies':  'WI',  'Sri Lanka':    'SL',  'Bangladesh':   'BAN',
  'Zimbabwe':     'ZIM', 'Afghanistan':  'AFG', 'Ireland':      'IRE',
}

// Ordered list of the 12 Full Member nations this tab tracks — exported so
// views can build a country filter dropdown without re-declaring the list.
export const NATIONS = [...INTL_NATIONS]

const NATION_COLORS = {
  'England':      '#3b82f6', 'South Africa': '#16a34a', 'Australia':    '#f59e0b',
  'New Zealand':  '#9ca3af', 'India':        '#4d90d3', 'Pakistan':     '#15803d',
  'West Indies':  '#dc2626', 'Sri Lanka':    '#6366f1', 'Bangladesh':   '#0d9488',
  'Zimbabwe':     '#84cc16', 'Afghanistan':  '#0891b2', 'Ireland':      '#86efac',
}

// CricAPI's raw matchType strings don't always match our internal format ids —
// notably, international T20s come back as "t20", not "t20i".
const MATCH_TYPE_ALIASES = { test: 'test', odi: 'odi', t20: 't20i', t20i: 't20i' }

function normalizeMatchType(raw) {
  return MATCH_TYPE_ALIASES[(raw || '').toLowerCase()] || null
}

// ─── Session cache ─────────────────────────────────────────────────────────────

const SESSION_KEY = 'ballpark_intlcricket_session_v1'
const SESSION_TTL = 10 * 60 * 1000

function readSession() {
  try {
    const c = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    if (!c || Date.now() - c.ts >= SESSION_TTL) return null
    return {
      games:     c.games.map(g => ({ ...g, gameDate: new Date(g.gameDate) })),
      updatedAt: c.updatedAt ? new Date(c.updatedAt) : null,
    }
  } catch { return null }
}
function writeSession({ games, updatedAt }) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now(), games, updatedAt })) } catch {}
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
}

// ─── Firestore ─────────────────────────────────────────────────────────────────

async function loadFromFirestore() {
  if (!isFirebaseConfigured) return null
  try {
    const snap = await getDoc(doc(db, 'intlCricketCache', 'current'))
    if (!snap.exists()) return null
    const { games = [], updatedAt } = snap.data()
    return {
      updatedAt: updatedAt?.toDate?.() ?? null,
      games: games.map(g => ({
        ...g,
        gameDate: g.gameDate?.toDate ? g.gameDate.toDate() : new Date(g.gameDate),
      })),
    }
  } catch { return null }
}

async function saveToFirestore(games) {
  if (!isFirebaseConfigured) return
  try {
    await setDoc(doc(db, 'intlCricketCache', 'current'), {
      games: games.map(g => ({
        ...g,
        gameDate: g.gameDate instanceof Date ? g.gameDate : new Date(g.gameDate),
      })),
      updatedAt: new Date(),
    })
  } catch (e) { console.warn('IntlCricket Firestore write failed:', e.message) }
}

// Maps our own stable entry ids (from INTL_CRICKET_SERIES_2026) to the real
// CricAPI series id resolved for them via search. Resolution costs one API
// call per series the first time it's seen, so it's cached permanently here
// rather than re-searched on every refresh.
//
// SERIES_MAP_VERSION guards against a stale/incorrect cache: if the matching
// logic changes (e.g. a query-format bug that wrongly cached most series as
// "not found"), bumping this constant discards the old cache wholesale so
// everything gets a clean re-resolution pass, instead of staying stuck on
// bad results forever.
const SERIES_MAP_VERSION = 2

async function loadSeriesMap() {
  if (!isFirebaseConfigured) return {}
  try {
    const snap = await getDoc(doc(db, 'intlCricketSeriesMap', 'current'))
    if (!snap.exists()) return {}
    const data = snap.data()
    if (data.version !== SERIES_MAP_VERSION) return {}
    return data.map || {}
  } catch { return {} }
}

async function saveSeriesMap(map) {
  if (!isFirebaseConfigured) return
  try {
    await setDoc(doc(db, 'intlCricketSeriesMap', 'current'), { version: SERIES_MAP_VERSION, map, updatedAt: new Date() })
  } catch (e) { console.warn('IntlCricket series-map Firestore write failed:', e.message) }
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function apiGet(path, apiKey) {
  const res = await fetch(`${BASE}/${path}&apikey=${apiKey}`)
  if (!res.ok) throw new Error(`CricAPI HTTP ${res.status}`)
  const json = await res.json()
  if (json.status === 'failure') throw new Error(json.reason || json.message || 'CricAPI error — check your API key')
  return json
}

// ─── Normalize ─────────────────────────────────────────────────────────────────

function parseInnings(scoreArr, teamName) {
  if (!scoreArr?.length) return []
  const keyword = teamName.toLowerCase().split(' ')[0]
  return scoreArr
    .filter(s => (s.inning || '').toLowerCase().includes(keyword))
    .map(s => ({ r: parseInt(s.r) || 0, w: parseInt(s.w) || 0, o: parseFloat(s.o) || 0 }))
}

function fmtInning(i, isTest) {
  if (isTest) return i.w >= 10 ? `${i.r}` : `${i.r}/${i.w}`
  return i.w >= 10 ? `${i.r} (${i.o})` : `${i.r}/${i.w} (${i.o})`
}

function formatInnings(innings, isTest) {
  if (!innings.length) return null
  return innings.map(i => fmtInning(i, isTest)).join(' & ')
}

function computeDifficulty(statusDetail, matchType) {
  if (!statusDetail) return null
  const d = statusDetail.toLowerCase()
  if (matchType === 'test') {
    if (d.includes('draw') || d.includes('drawn')) return { label: 'Hard Fought', cls: 'bg-sky-500/20 text-sky-400 border border-sky-500/30' }
    if (d.includes('innings'))                      return { label: 'Dominant',    cls: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' }
  }
  const wm = d.match(/won by (\d+) wickets?/)
  if (wm) {
    const w = parseInt(wm[1])
    if (w <= 2) return { label: 'Thriller',   cls: 'bg-red-500/20 text-red-400 border border-red-500/30' }
    if (w <= 4) return { label: 'Close',       cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' }
    if (w <= 6) return { label: 'Competitive', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' }
    return       { label: 'Comfortable',  cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' }
  }
  const rm = d.match(/won by (\d+) runs?/)
  if (rm) {
    const r = parseInt(rm[1])
    const closeThreshold = matchType === 'test' ? 15 : 10
    const compThreshold  = matchType === 'test' ? 50 : 25
    if (r <= closeThreshold) return { label: 'Thriller',   cls: 'bg-red-500/20 text-red-400 border border-red-500/30' }
    if (r <= compThreshold)  return { label: 'Close',       cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' }
    if (r <= 150)            return { label: 'Competitive', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' }
    return                          { label: 'Comfortable', cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' }
  }
  return null
}

function resolveWinner(statusDetail, homeName, awayName) {
  if (!statusDetail) return null
  const d = statusDetail.toLowerCase()
  if (d.includes('drawn') || d.includes('draw')) return 'draw'
  if (d.includes('abandoned') || d.includes('no result')) return 'nr'
  const m = statusDetail.match(/^(.+?)\s+won\s+by/i)
  if (!m) return null
  const winner = m[1].trim().toLowerCase()
  if (homeName.toLowerCase().includes(winner) || winner.includes(homeName.toLowerCase().split(' ')[0])) return 'home'
  if (awayName.toLowerCase().includes(winner) || winner.includes(awayName.toLowerCase().split(' ')[0])) return 'away'
  return null
}

function formatDateRange(startDate) {
  const end = new Date(startDate)
  end.setDate(end.getDate() + 4)
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (startDate.getMonth() === end.getMonth()) {
    return `${startStr}–${end.getDate()}`
  }
  return `${startStr}–${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function extractSeriesLabel(name) {
  if (!name) return 'Cricket'
  const stripped = name.replace(/,\s*(?:\d+(?:st|nd|rd|th)\s+(?:Test|ODI|T20I)|Only\s+(?:Test|ODI|T20I)|(?:Finals?|Semi.?Finals?|Quarter.?Finals?|Super\s+(?:4s|6s|8s|Fours|Sixes|Eights)))\s*$/i, '').trim()
  return stripped || name
}

// CricAPI encodes which match-in-the-series this is directly in the raw name
// (e.g. "New Zealand tour of India, 2026, 2nd ODI") — the same trailing
// segment extractSeriesLabel() strips off above. Captures just the ordinal
// token ("2nd", "Only") so the format badge can show "2nd ODI"/"Only Test"
// instead of a flat "ODI"/"Test Match". Returns null for match names that
// don't carry this pattern (tournament fixtures like "5th Match, Group A"),
// so the caller falls back to the generic label.
function extractMatchOrdinal(name) {
  if (!name) return null
  if (/,\s*Only\s+(?:Test|ODI|T20I)\s*$/i.test(name)) return 'Only'
  const m = name.match(/,\s*(\d+(?:st|nd|rd|th))\s+(?:Test|ODI|T20I)\s*$/i)
  return m ? m[1] : null
}

function normalizeMatch(match, seriesLabelOverride) {
  const teams = match.teams || []
  if (teams.length < 2) return null
  if (!teams.every(t => INTL_NATIONS.has(t))) return null

  const matchType = normalizeMatchType(match.matchType)
  if (!matchType) return null

  const [home, away] = teams
  const teamInfo = match.teamInfo || []
  const homeInfo  = teamInfo.find(t => t.name === home) || {}
  const awayInfo  = teamInfo.find(t => t.name === away) || {}

  const isLive  = match.matchStarted && !match.matchEnded
  const isFinal = !!match.matchEnded
  const isTest  = matchType === 'test'

  const homeInnings = (isFinal || isLive) ? parseInnings(match.score, home) : []
  const awayInnings = (isFinal || isLive) ? parseInnings(match.score, away) : []

  const homeScoreStr = formatInnings(homeInnings, isTest)
  const awayScoreStr = formatInnings(awayInnings, isTest)

  const statusDetail = match.status || (isLive ? 'Live' : isFinal ? 'Final' : 'Scheduled')
  const result       = isFinal ? resolveWinner(statusDetail, home, away) : null
  const homeWon      = result === 'home'
  const awayWon      = result === 'away'

  const img = t => t.img ? t.img.replace('?w=48', '?w=96') : null

  const gameDate = new Date(match.dateTimeGMT || match.date || Date.now())

  const formatWord = isTest ? 'Test' : matchType === 'odi' ? 'ODI' : 'T20I'
  const matchOrdinal = extractMatchOrdinal(match.name)
  const gameTypeLabel = matchOrdinal ? `${matchOrdinal} ${formatWord}` : (isTest ? 'Test Match' : formatWord)

  // Show a date range for scheduled/live tests (up to 5 days)
  const dateRange = isTest && !isFinal ? formatDateRange(gameDate) : null

  const matchName = match.name || `${home} vs ${away}`
  const dateStr   = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const highlightUrl = isFinal
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${matchName} highlights ${dateStr}`)}`
    : null

  return {
    id:         match.id,
    league:     'cricket',
    matchType,
    homeTeam: {
      id:           home,
      name:         home,
      abbreviation: NATION_ABBR[home] || homeInfo.shortname || home.slice(0, 3).toUpperCase(),
      logo:         img(homeInfo),
      color:        NATION_COLORS[home] || null,
    },
    awayTeam: {
      id:           away,
      name:         away,
      abbreviation: NATION_ABBR[away] || awayInfo.shortname || away.slice(0, 3).toUpperCase(),
      logo:         img(awayInfo),
      color:        NATION_COLORS[away] || null,
    },
    homeScore:    null,
    awayScore:    null,
    homeScoreStr,
    awayScoreStr,
    homeInnings,
    awayInnings,
    homeWon,
    awayWon,
    status:       isLive ? 'live' : isFinal ? 'final' : 'scheduled',
    statusDetail,
    gameDate,
    dateRange,
    gameType:     gameTypeLabel,
    difficulty:   isFinal ? computeDifficulty(statusDetail, matchType) : null,
    seriesLabel:  seriesLabelOverride || extractSeriesLabel(matchName),
    highlightUrl,
    venue:        match.venue || null,
  }
}

// Re-derives just the gameType badge for an already-cached finished match,
// using the match name from this refresh's series_info listing (already
// fetched — costs no extra API call). Cached matches skip normalizeMatch()
// entirely to avoid re-spending match_info quota on scores that never
// change, so this is what lets old cache entries pick up ordinal labeling
// added after they were first stored, without a full re-hydrate.
function relabelCachedMatch(cached, rawName) {
  const ordinal = extractMatchOrdinal(rawName)
  if (!ordinal) return cached
  const formatWord = cached.matchType === 'test' ? 'Test' : cached.matchType === 'odi' ? 'ODI' : 'T20I'
  const gameType = `${ordinal} ${formatWord}`
  return gameType === cached.gameType ? cached : { ...cached, gameType }
}

// ─── Series discovery & resolution ─────────────────────────────────────────────
// CricAPI's /matches listing turned out to be an incomplete "current window"
// feed, not a full-year schedule (it silently omitted most 2026 series). The
// year's schedule instead comes from INTL_CRICKET_SERIES_2026 — a curated
// list sourced from Wikipedia's season pages — resolved to real CricAPI
// series ids by name search, then hydrated via series_info/match_info the
// same way src/api/wtc.js already does for WTC.

function scoreSeriesCandidate(candidate, entry) {
  const name = (candidate.name || '').toLowerCase()
  let nationHits = 0
  for (const nation of entry.nations) {
    if (name.includes(nation.toLowerCase())) nationHits++
  }
  const candidateStart = candidate.startDate ? new Date(candidate.startDate) : null
  const entryStart = new Date(entry.start)
  const dateDiffDays = candidateStart && !isNaN(candidateStart)
    ? Math.abs((candidateStart - entryStart) / 86400000)
    : Infinity
  const formatOverlap = entry.formats.some(f => {
    if (f === 'test') return (candidate.test ?? 0) > 0
    if (f === 'odi')  return (candidate.odi ?? 0) > 0
    if (f === 't20i') return (candidate.t20 ?? 0) > 0
    return false
  })
  return { nationHits, dateDiffDays, formatOverlap }
}

// CricAPI's search does substring matching against the series `name` field
// (which always follows "<Team> tour of <Team>, <Year>") rather than a
// keyword/AND search — searching "Sri Lanka Pakistan" returns nothing, but
// "Sri Lanka tour of Pakistan" or "Pakistan tour of Sri Lanka" does. Since we
// don't know in advance which of our two nations CricAPI treats as the
// touring side, try one direction, and only spend a second search call on
// the other direction if the first didn't produce a usable match.
async function searchSeriesCandidates(query, apiKey) {
  const resp = await apiGet(`series?search=${encodeURIComponent(query)}`, apiKey)
  return resp.data ?? []
}

function pickBestCandidate(candidates, entry) {
  const minNationHits = entry.tournament ? 0 : 2
  let best = null
  let bestScore = -Infinity
  for (const c of candidates) {
    if (!c?.id) continue
    const s = scoreSeriesCandidate(c, entry)
    if (!s.formatOverlap) continue
    if (s.nationHits < minNationHits) continue
    if (s.dateDiffDays > 60) continue
    const score = s.nationHits * 1000 - s.dateDiffDays
    if (score > bestScore) { bestScore = score; best = c.id }
  }
  return best
}

// Resolves one master-list entry to a CricAPI series id via /series?search.
// Returns: a string id on a good match, null if the search genuinely found
// nothing suitable (cached as a permanent skip), or undefined if the API
// call itself failed — e.g. quota exhaustion — which must NOT be cached,
// so it's retried on a future refresh instead of being skipped forever.
async function resolveSeriesId(entry, apiKey) {
  const queries = entry.tournament
    ? [entry.label]
    : [`${entry.nations[0]} tour of ${entry.nations[1]}`, `${entry.nations[1]} tour of ${entry.nations[0]}`]

  for (const query of queries) {
    let candidates
    try {
      candidates = await searchSeriesCandidates(query, apiKey)
    } catch {
      return undefined
    }
    const best = pickBestCandidate(candidates, entry)
    if (best) return best
  }
  return null
}

// ─── Core fetch ────────────────────────────────────────────────────────────────

// Resolution costs one (sometimes two) search calls per series, so only a
// bounded batch of still-unresolved entries is attempted per refresh — full
// resolution of all ~40 series completes over roughly five refreshes rather
// than spending the whole daily quota (shared with the BBL tab) at once.
const RESOLVE_BATCH = 8

async function fetchFromAPI(apiKey, { existingGames = [] } = {}) {
  const scoredMap = {}
  for (const g of existingGames) {
    if (g.status === 'final') scoredMap[g.id] = g
  }

  const currentYear = new Date().getFullYear()
  const yearStart   = new Date(currentYear, 0, 1)
  const yearEnd     = new Date(currentYear + 1, 0, 1) // exclusive

  const seriesMap  = await loadSeriesMap()
  const unresolved = INTL_CRICKET_SERIES_2026.filter(e => !(e.id in seriesMap))
  const toResolve  = unresolved.slice(0, RESOLVE_BATCH)

  let resolvedCount = 0
  let mapChanged = false
  for (const entry of toResolve) {
    const cricapiId = await resolveSeriesId(entry, apiKey)
    if (cricapiId !== undefined) {
      seriesMap[entry.id] = cricapiId
      mapChanged = true
      if (cricapiId) resolvedCount++
    }
  }
  if (mapChanged) await saveSeriesMap(seriesMap)

  const resolvedEntries = INTL_CRICKET_SERIES_2026
    .map(entry => ({ entry, cricapiId: seriesMap[entry.id] }))
    .filter(x => x.cricapiId)

  // Schedule discovery: one series_info call per resolved series.
  const seriesResults = await Promise.allSettled(
    resolvedEntries.map(({ cricapiId }) => apiGet(`series_info?id=${cricapiId}`, apiKey))
  )

  const seen     = new Set()
  const allStubs = []
  seriesResults.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const { entry } = resolvedEntries[i]
    const data     = r.value.data
    const fixtures = Array.isArray(data) ? data : (data?.matchList || [])
    for (const m of fixtures) {
      if (!m?.id || seen.has(m.id)) continue
      const matchDate = new Date(m.dateTimeGMT || m.date)
      if (matchDate < yearStart || matchDate >= yearEnd) continue
      if (!normalizeMatchType(m.matchType)) continue
      const teams = m.teams || []
      if (teams.length < 2 || !teams.every(t => INTL_NATIONS.has(t))) continue
      seen.add(m.id)
      allStubs.push({ stub: m, seriesLabel: entry.label })
    }
  })

  // Incremental hydration: only fetch match_info for newly-completed matches
  const needsHydration = allStubs.filter(({ stub }) => stub.matchEnded && !scoredMap[stub.id])
  const hydrated = {}
  const BATCH = 10
  for (let i = 0; i < needsHydration.length; i += BATCH) {
    const batch   = needsHydration.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(({ stub }) => apiGet(`match_info?id=${stub.id}`, apiKey)))
    results.forEach((r, j) => { if (r.status === 'fulfilled') hydrated[batch[j].stub.id] = r.value.data })
  }

  const freshGames = allStubs
    .map(({ stub, seriesLabel }) => {
      if (scoredMap[stub.id]) return relabelCachedMatch(scoredMap[stub.id], stub.name)
      return normalizeMatch(hydrated[stub.id] || stub, seriesLabel)
    })
    .filter(Boolean)

  // Preserve previously cached completed games that didn't appear in this API window
  const freshIds  = new Set(freshGames.map(g => g.id))
  const preserved = existingGames.filter(g => g.status === 'final' && !freshIds.has(g.id))

  const games = [...freshGames, ...preserved].sort((a, b) => b.gameDate - a.gameDate)

  await saveToFirestore(games)
  return {
    games,
    fetched: needsHydration.length,
    resolved: resolvedCount,
    pendingResolution: unresolved.length - toResolve.length,
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function fetchIntlCricketGames(apiKey) {
  const session = readSession()
  if (session) return session

  const cached = await loadFromFirestore()
  if (cached?.games?.length) {
    const result = { games: cached.games, updatedAt: cached.updatedAt }
    writeSession(result)
    return result
  }

  return { games: [], updatedAt: null }
}

export async function refreshIntlCricketGames(apiKey) {
  const existing = await loadFromFirestore()
  const { games, fetched, resolved, pendingResolution } = await fetchFromAPI(apiKey, { existingGames: existing?.games ?? [] })
  const result = { games, updatedAt: new Date(), fetched, resolved, pendingResolution }
  clearSession()
  writeSession(result)
  return result
}
