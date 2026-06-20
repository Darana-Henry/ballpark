import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'

const BASE = 'https://api.cricapi.com/v1'

const INTL_NATIONS = new Set([
  'England', 'South Africa', 'Australia', 'New Zealand',
  'India', 'Pakistan', 'West Indies', 'Sri Lanka',
  'Bangladesh', 'Zimbabwe', 'Afghanistan', 'Ireland',
])

const NATION_ABBR = {
  'England':      'ENG', 'South Africa': 'SA',  'Australia':    'AUS',
  'New Zealand':  'NZ',  'India':        'IND', 'Pakistan':     'PAK',
  'West Indies':  'WI',  'Sri Lanka':    'SL',  'Bangladesh':   'BAN',
  'Zimbabwe':     'ZIM', 'Afghanistan':  'AFG', 'Ireland':      'IRE',
}

const NATION_COLORS = {
  'England':      '#3b82f6', 'South Africa': '#16a34a', 'Australia':    '#f59e0b',
  'New Zealand':  '#9ca3af', 'India':        '#4d90d3', 'Pakistan':     '#15803d',
  'West Indies':  '#dc2626', 'Sri Lanka':    '#6366f1', 'Bangladesh':   '#0d9488',
  'Zimbabwe':     '#84cc16', 'Afghanistan':  '#0891b2', 'Ireland':      '#86efac',
}

const MATCH_TYPES = new Set(['test', 'odi', 't20i'])

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
  if (!name) return 'International Cricket'
  const stripped = name.replace(/,\s*(?:\d+(?:st|nd|rd|th)\s+(?:Test|ODI|T20I)|Only\s+(?:Test|ODI|T20I)|(?:Finals?|Semi.?Finals?|Quarter.?Finals?|Super\s+(?:4s|6s|8s|Fours|Sixes|Eights)))\s*$/i, '').trim()
  return stripped || name
}

function normalizeMatch(match) {
  const teams = match.teams || []
  if (teams.length < 2) return null
  if (!teams.every(t => INTL_NATIONS.has(t))) return null

  const matchType = (match.matchType || '').toLowerCase()
  if (!MATCH_TYPES.has(matchType)) return null

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

  const gameTypeLabel = isTest ? 'Test Match' : matchType === 'odi' ? 'ODI' : 'T20I'

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
    seriesLabel:  extractSeriesLabel(matchName),
    highlightUrl,
    venue:        match.venue || null,
  }
}

// ─── Core fetch ────────────────────────────────────────────────────────────────

const MAX_PAGES = 8
const PAGE_SIZE = 25

async function fetchFromAPI(apiKey, { existingGames = [] } = {}) {
  // Build cache maps from existing data
  const existingMap = {}
  const scoredMap   = {}
  for (const g of existingGames) {
    existingMap[g.id] = g
    if (g.status === 'final') scoredMap[g.id] = g
  }

  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const seen      = new Set()
  const allStubs  = []

  for (let page = 0; page < MAX_PAGES; page++) {
    let pageData
    try {
      const resp = await apiGet(`matches?offset=${page * PAGE_SIZE}`, apiKey)
      pageData = resp.data ?? []
    } catch { break }

    if (!pageData.length) break

    let anyQualifying = false
    for (const m of pageData) {
      if (!m?.id || seen.has(m.id)) continue
      const matchDate = new Date(m.dateTimeGMT || m.date)
      if (matchDate < yearStart) continue

      const mt = (m.matchType || '').toLowerCase()
      if (!MATCH_TYPES.has(mt)) continue

      const teams = m.teams || []
      if (teams.length < 2 || !teams.every(t => INTL_NATIONS.has(t))) continue

      seen.add(m.id)
      allStubs.push(m)
      anyQualifying = true
    }

    // Stop early only after page 1 if a full page had no qualifying matches
    if (!anyQualifying && page > 0) break
  }

  // Incremental hydration: only fetch match_info for newly-completed matches
  const needsHydration = allStubs.filter(m => m.matchEnded && !scoredMap[m.id])
  const hydrated = {}
  const BATCH = 10
  for (let i = 0; i < needsHydration.length; i += BATCH) {
    const batch   = needsHydration.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(m => apiGet(`match_info?id=${m.id}`, apiKey)))
    results.forEach((r, j) => { if (r.status === 'fulfilled') hydrated[batch[j].id] = r.value.data })
  }

  const freshGames = allStubs
    .map(m => {
      if (scoredMap[m.id]) return scoredMap[m.id]
      return normalizeMatch(hydrated[m.id] || m)
    })
    .filter(Boolean)

  // Preserve previously cached completed games that didn't appear in this API window
  const freshIds  = new Set(freshGames.map(g => g.id))
  const preserved = existingGames.filter(g => g.status === 'final' && !freshIds.has(g.id))

  const games = [...freshGames, ...preserved].sort((a, b) => b.gameDate - a.gameDate)

  await saveToFirestore(games)
  return { games, fetched: needsHydration.length }
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
  const { games, fetched } = await fetchFromAPI(apiKey, { existingGames: existing?.games ?? [] })
  const result = { games, updatedAt: new Date(), fetched }
  clearSession()
  writeSession(result)
  return result
}
