import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'

const BASE = 'https://api.cricapi.com/v1'

// ICC WTC full-member nations (2025-27 cycle)
const WTC_ABBR = {
  'India':        'IND', 'England':     'ENG', 'Australia':   'AUS',
  'South Africa': 'SA',  'New Zealand': 'NZ',  'Pakistan':    'PAK',
  'Bangladesh':   'BAN', 'Sri Lanka':   'SL',  'West Indies': 'WI',
}

const WTC_COLORS = {
  'India':        '#4d90d3',
  'England':      '#3b82f6',
  'Australia':    '#f5a623',
  'South Africa': '#16a34a',
  'New Zealand':  '#9ca3af',
  'Pakistan':     '#15803d',
  'Bangladesh':   '#0d9488',
  'Sri Lanka':    '#6366f1',
  'West Indies':  '#dc2626',
}

// WTC 2025-27 series IDs discovered via API probe (June 2026)
const WTC_SERIES = [
  // 2025 (completed)
  '8f227d30-17ca-4b64-9896-90fb2521f78f',  // India tour of England, 2025
  'e04d1e32-644a-43dd-9894-8a0f6be0f297',  // Australia tour of West Indies, 2025
  'be9e024b-d652-4147-998e-2efd3f618d67',  // Bangladesh tour of Sri Lanka, 2025
  '4a231d95-58f8-4c1e-bdd0-45b7e4cd8f64',  // South Africa tour of India, 2025
  '6dbe4015-9930-44cd-ac38-7107c8342834',  // South Africa tour of Pakistan, 2025
  '527cba80-4d6e-4545-b05e-d0b76f7f3e37',  // West Indies tour of India, 2025
  'cfc36548-e614-488a-ac12-acdce01ffdec',  // West Indies tour of New Zealand, 2025
  // 2026 (current/upcoming)
  '4f8f04e8-8c11-402d-9bc3-48c09603d9d8',  // Pakistan tour of England, 2026
  '9d2e220f-91ba-4f22-b9fe-9b4df35e7ab3',  // New Zealand tour of England, 2026
  '0c2de514-946a-4b55-a6e3-4d1d6e892459',  // Australia tour of South Africa, 2026
  '9f0a2527-1508-42b3-9945-4ade13fd4b5a',  // India tour of New Zealand, 2026
  'f85a6390-cbf2-4f07-bc5e-891df17ff179',  // Bangladesh tour of Australia, 2026
  '7acadb0c-bc4e-4c91-8c47-7bbe53f2227b',  // Bangladesh tour of South Africa, 2026
  'cfb08428-4fd5-4d35-be9b-d18f73ae4d3a',  // Sri Lanka tour of West Indies, 2026
  '9a3523b4-f7fc-4e63-854e-5bf640456d20',  // Pakistan tour of West Indies, 2026
  '122a012b-7af2-472c-9555-80bc3d786a37',  // Pakistan tour of Bangladesh, 2026
  // 2026-27
  '93247670-a816-4dde-a282-be0e867e3d26',  // England tour of South Africa, 2026-27
  '5bb37247-d995-429a-b269-3a5f8517c4f2',  // New Zealand tour of Australia, 2026-27
  // 2027
  '181dfb42-895f-4a4d-8907-94c125df9871',  // Australia tour of India, 2027
]

// ─── Session cache ─────────────────────────────────────────────────────────────

const SESSION_KEY = 'ballpark_wtc_session_v1'
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
    const snap = await getDoc(doc(db, 'wtcCache', 'current'))
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
    await setDoc(doc(db, 'wtcCache', 'current'), {
      games: games.map(g => ({
        ...g,
        gameDate: g.gameDate instanceof Date ? g.gameDate : new Date(g.gameDate),
      })),
      updatedAt: new Date(),
    })
  } catch (e) { console.warn('WTC Firestore write failed:', e.message) }
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function apiGet(path, apiKey) {
  const res = await fetch(`${BASE}/${path}&apikey=${apiKey}`)
  if (!res.ok) throw new Error(`CricAPI HTTP ${res.status}`)
  const json = await res.json()
  if (json.status === 'failure') throw new Error(json.reason || json.message || 'CricAPI error — check your API key')
  return json.data ?? []
}

// ─── Normalize ─────────────────────────────────────────────────────────────────

function parseInnings(scoreArr, teamName) {
  if (!scoreArr?.length) return []
  const keyword = teamName.toLowerCase().split(' ')[0]
  return scoreArr
    .filter(s => (s.inning || '').toLowerCase().includes(keyword))
    .map(s => ({ r: parseInt(s.r) || 0, w: parseInt(s.w) || 0, o: parseFloat(s.o) || 0 }))
}

function fmtInning(i) {
  return i.w >= 10 ? `${i.r}` : `${i.r}/${i.w}`
}

function formatInnings(innings) {
  if (!innings.length) return null
  return innings.map(fmtInning).join(' & ')
}

function computeDifficulty(statusDetail) {
  if (!statusDetail) return null
  const d = statusDetail.toLowerCase()
  if (d.includes('draw') || d.includes('drawn')) {
    return { label: 'Hard Fought', cls: 'bg-sky-500/20 text-sky-400 border border-sky-500/30' }
  }
  if (d.includes('innings')) {
    return { label: 'Dominant', cls: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' }
  }
  const wm = d.match(/won by (\d+) wickets?/)
  if (wm) {
    const w = parseInt(wm[1])
    if (w <= 2) return { label: 'Thriller',    cls: 'bg-red-500/20 text-red-400 border border-red-500/30' }
    if (w <= 4) return { label: 'Close',        cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' }
    if (w <= 6) return { label: 'Competitive',  cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' }
    return             { label: 'Comfortable',  cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' }
  }
  const rm = d.match(/won by (\d+) runs?/)
  if (rm) {
    const r = parseInt(rm[1])
    if (r <= 15)  return { label: 'Thriller',   cls: 'bg-red-500/20 text-red-400 border border-red-500/30' }
    if (r <= 50)  return { label: 'Close',       cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' }
    if (r <= 150) return { label: 'Competitive', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' }
    return              { label: 'Comfortable',  cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' }
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
  const homeL = homeName.toLowerCase()
  const awayL = awayName.toLowerCase()
  if (homeL.includes(winner) || winner.includes(homeL.split(' ')[0])) return 'home'
  if (awayL.includes(winner) || winner.includes(awayL.split(' ')[0])) return 'away'
  return null
}

function normalizeMatch(match, seriesName) {
  const teams = match.teams || []
  if (teams.length < 2) return null
  const [home, away] = teams

  const teamInfo = match.teamInfo || []
  const homeInfo = teamInfo.find(t => t.name === home) || {}
  const awayInfo = teamInfo.find(t => t.name === away) || {}

  const isLive  = match.matchStarted && !match.matchEnded
  const isFinal = !!match.matchEnded

  const homeInnings = (isFinal || isLive) ? parseInnings(match.score, home) : []
  const awayInnings = (isFinal || isLive) ? parseInnings(match.score, away) : []

  const homeScoreStr = formatInnings(homeInnings)
  const awayScoreStr = formatInnings(awayInnings)

  const statusDetail = match.status || (isLive ? 'Live' : isFinal ? 'Final' : 'Scheduled')
  const result       = isFinal ? resolveWinner(statusDetail, home, away) : null
  const homeWon      = result === 'home'
  const awayWon      = result === 'away'

  const img = t => t.img ? t.img.replace('?w=48', '?w=96') : null

  const matchLabel = match.name || `${home} vs ${away}`
  const dateStr    = new Date(match.dateTimeGMT || match.date || Date.now())
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const highlightUrl = isFinal
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${matchLabel} highlights ${dateStr}`)}`
    : null

  return {
    id:   match.id,
    league: 'wtc',
    homeTeam: {
      id:           home,
      name:         home,
      abbreviation: WTC_ABBR[home] || homeInfo.shortname || home.slice(0, 3).toUpperCase(),
      logo:         img(homeInfo),
      color:        WTC_COLORS[home] || null,
    },
    awayTeam: {
      id:           away,
      name:         away,
      abbreviation: WTC_ABBR[away] || awayInfo.shortname || away.slice(0, 3).toUpperCase(),
      logo:         img(awayInfo),
      color:        WTC_COLORS[away] || null,
    },
    matchType:    'test',
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
    gameDate:     new Date(match.dateTimeGMT || match.date || Date.now()),
    gameType:     'Test Match',
    difficulty:   isFinal ? computeDifficulty(statusDetail) : null,
    seriesName:   seriesName || 'WTC 2025-27',
    highlightUrl,
    venue:        match.venue || null,
  }
}

// ─── Core fetch ────────────────────────────────────────────────────────────────

async function fetchFromAPI(apiKey, { existingGames = [] } = {}) {
  const scoredMap = {}
  for (const g of existingGames) {
    if (g.status === 'final') scoredMap[g.id] = g
  }

  // Fetch all series info in parallel
  const seriesResults = await Promise.allSettled(
    WTC_SERIES.map(id => apiGet(`series_info?id=${id}`, apiKey))
  )

  // Collect all test-match stubs from all series, deduplicated
  const seen      = new Set()
  const allStubs  = []
  for (const r of seriesResults) {
    if (r.status !== 'fulfilled') continue
    const data       = r.value
    const seriesName = Array.isArray(data) ? 'WTC 2025-27' : (data?.name || 'WTC 2025-27')
    const fixtures   = Array.isArray(data) ? data : (data?.matchList || [])
    for (const m of fixtures) {
      if (!m?.id || seen.has(m.id)) continue
      if (m.matchType && m.matchType !== 'test') continue
      seen.add(m.id)
      allStubs.push({ stub: m, seriesName })
    }
  }

  // Incremental hydration: only fetch match_info for newly-completed matches
  const needsHydration = allStubs.filter(({ stub }) => stub.matchEnded && !scoredMap[stub.id])
  const hydrated = {}
  const BATCH = 10
  for (let i = 0; i < needsHydration.length; i += BATCH) {
    const batch   = needsHydration.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(({ stub }) => apiGet(`match_info?id=${stub.id}`, apiKey)))
    results.forEach((r, j) => { if (r.status === 'fulfilled') hydrated[batch[j].stub.id] = r.value })
  }

  const games = allStubs
    .map(({ stub, seriesName }) => {
      if (scoredMap[stub.id]) return scoredMap[stub.id]
      return normalizeMatch(hydrated[stub.id] || stub, seriesName)
    })
    .filter(Boolean)
    .sort((a, b) => b.gameDate - a.gameDate)

  await saveToFirestore(games)
  return { games, fetched: needsHydration.length }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function fetchWTCGames(apiKey) {
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

export async function refreshWTCGames(apiKey) {
  const existing = await loadFromFirestore()
  const { games, fetched } = await fetchFromAPI(apiKey, { existingGames: existing?.games ?? [] })
  const result = { games, updatedAt: new Date(), fetched }
  clearSession()
  writeSession(result)
  return result
}
