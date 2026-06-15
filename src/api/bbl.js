import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'

const BASE = 'https://api.cricapi.com/v1'

const BBL_TEAMS = new Set([
  'Adelaide Strikers', 'Brisbane Heat', 'Hobart Hurricanes',
  'Melbourne Renegades', 'Melbourne Stars', 'Perth Scorchers',
  'Sydney Sixers', 'Sydney Thunder',
])

const ABBR = {
  'Adelaide Strikers':   'STR', 'Brisbane Heat':       'HEA',
  'Hobart Hurricanes':   'HUR', 'Melbourne Renegades': 'REN',
  'Melbourne Stars':     'STA', 'Perth Scorchers':     'SCO',
  'Sydney Sixers':       'SIX', 'Sydney Thunder':      'THU',
}

const COLORS = {
  'Adelaide Strikers':   '#1d79e0',
  'Brisbane Heat':       '#ef4444',
  'Hobart Hurricanes':   '#a855f7',
  'Melbourne Renegades': '#dc2626',
  'Melbourne Stars':     '#10b981',
  'Perth Scorchers':     '#fb923c',
  'Sydney Sixers':       '#ec4899',
  'Sydney Thunder':      '#84cc16',
}

const FALLBACK_LOGOS = {
  'Adelaide Strikers':   'https://g.cricapi.com/iapi/113-637877085901698892.webp?w=96',
  'Brisbane Heat':       'https://g.cricapi.com/iapi/128-637957474274254899.webp?w=96',
  'Hobart Hurricanes':   'https://g.cricapi.com/iapi/178-637945148636541193.webp?w=96',
  'Melbourne Renegades': 'https://g.cricapi.com/iapi/221-637940203193119640.webp?w=96',
  'Melbourne Stars':     'https://g.cricapi.com/iapi/222-637940204119809081.webp?w=96',
  'Perth Scorchers':     'https://g.cricapi.com/iapi/248-637940202614777832.webp?w=96',
  'Sydney Sixers':       'https://g.cricapi.com/iapi/282-637935045702671726.png?w=96',
  'Sydney Thunder':      'https://g.cricapi.com/iapi/283-637935045529865505.png?w=96',
}

// ─── Session cache ────────────────────────────────────────────────────────────
// Avoids redundant Firestore reads when navigating back to the BBL tab.
// sessionStorage clears automatically when the tab is closed.

const SESSION_KEY = 'ballpark_bbl_session_v1'
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

// ─── Firestore ────────────────────────────────────────────────────────────────

async function loadFromFirestore() {
  if (!isFirebaseConfigured) return null
  try {
    const snap = await getDoc(doc(db, 'bblCache', 'current'))
    if (!snap.exists()) return null
    const { games = [], seriesId = null, updatedAt } = snap.data()
    return {
      seriesId,
      updatedAt: updatedAt?.toDate?.() ?? null,
      games: games.map(g => {
        const gameDate = g.gameDate?.toDate ? g.gameDate.toDate() : new Date(g.gameDate)
        const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        return {
          ...g,
          gameDate,
          highlightUrl: g.status === 'final'
            ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${g.awayTeam.name} vs ${g.homeTeam.name} BBL highlights ${dateStr}`)}`
            : null,
        }
      }),
    }
  } catch { return null }
}

async function saveToFirestore(games, seriesId) {
  if (!isFirebaseConfigured) return
  try {
    await setDoc(doc(db, 'bblCache', 'current'), {
      games: games.map(g => ({
        ...g,
        gameDate: g.gameDate instanceof Date ? g.gameDate : new Date(g.gameDate),
      })),
      seriesId,
      updatedAt: new Date(),
    })
  } catch (e) { console.warn('BBL Firestore write failed:', e.message) }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiGet(path, apiKey) {
  const res = await fetch(`${BASE}/${path}&apikey=${apiKey}`)
  if (!res.ok) throw new Error(`CricAPI HTTP ${res.status}`)
  const json = await res.json()
  if (json.status === 'failure') throw new Error(json.reason || json.message || 'CricAPI error — check your API key')
  return json.data ?? []
}

async function findBBLSeriesId(apiKey) {
  const isBBLSeries = s => {
    const n = (s.name || '').toLowerCase()
    return n.includes('big bash league') || (n.includes('bbl') && n.includes('2'))
  }
  const searchBatch = async offsets => {
    const results = await Promise.allSettled(offsets.map(o => apiGet(`series?offset=${o}`, apiKey)))
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const hit = r.value.find(isBBLSeries)
      if (hit) return hit.id
    }
    return null
  }
  let id = await searchBatch([0, 25, 50, 125, 150, 175])
  if (!id) id = await searchBatch([75, 100, 200, 225])
  return id
}

// ─── Normalize ────────────────────────────────────────────────────────────────

function isBBLMatch(match) {
  return (match.teams || []).some(t => BBL_TEAMS.has(t))
}

function logoFromTeamInfo(teamInfo, teamName) {
  const info = (teamInfo || []).find(t => t.name === teamName)
  const url = info?.img || FALLBACK_LOGOS[teamName] || null
  return url ? url.replace('?w=48', '?w=96') : null
}

function parseScore(scoreArr, teamName) {
  if (!scoreArr?.length) return null
  const key = teamName.toLowerCase().split(' ')[0]
  const inning = scoreArr.find(s => (s.inning || '').toLowerCase().includes(key))
  return inning != null ? (parseInt(inning.r) || 0) : null
}

function normalizeMatch(match) {
  const teams = match.teams || []
  if (teams.length < 2 || !isBBLMatch(match)) return null
  const [home, away] = teams

  const isLive  = match.matchStarted && !match.matchEnded
  const isFinal = !!match.matchEnded

  const gameDate = new Date(match.dateTimeGMT || match.date || Date.now())
  const dateStr  = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return {
    id:       match.id,
    league:   'bbl',
    homeTeam: {
      id:           home,
      name:         home,
      abbreviation: ABBR[home] || home.slice(0, 3).toUpperCase(),
      logo:         logoFromTeamInfo(match.teamInfo, home),
      color:        COLORS[home] || null,
    },
    awayTeam: {
      id:           away,
      name:         away,
      abbreviation: ABBR[away] || away.slice(0, 3).toUpperCase(),
      logo:         logoFromTeamInfo(match.teamInfo, away),
      color:        COLORS[away] || null,
    },
    homeScore:    (isLive || isFinal) ? parseScore(match.score, home) : null,
    awayScore:    (isLive || isFinal) ? parseScore(match.score, away) : null,
    status:       isLive ? 'live' : isFinal ? 'final' : 'scheduled',
    statusDetail: match.status || (isLive ? 'Live' : isFinal ? 'Final' : 'Scheduled'),
    gameDate,
    gameType:     'Big Bash League',
    highlightUrl: isFinal
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${away} vs ${home} BBL highlights ${dateStr}`)}`
      : null,
    venue:        match.venue || null,
  }
}

// ─── Core fetch ───────────────────────────────────────────────────────────────
// Incremental: reuses already-scored games from Firestore, only calls
// match_info for new completed matches. First-ever fetch hydrates all of them.

async function fetchFromAPI(apiKey, { cachedSeriesId = null, existingGames = [] } = {}) {
  const scoredMap = {}
  for (const g of existingGames) {
    if (g.status === 'final') scoredMap[g.id] = g
  }

  const seriesId = cachedSeriesId || await findBBLSeriesId(apiKey)
  if (!seriesId) throw new Error('BBL series not found — CricAPI may be rate-limited. Try again in a few minutes.')

  const [liveData, seriesData] = await Promise.all([
    apiGet('currentMatches?offset=0', apiKey).catch(() => []),
    apiGet(`series_info?id=${seriesId}`, apiKey),
  ])

  const fixtures = Array.isArray(seriesData) ? seriesData : (seriesData?.matchList || [])
  const liveMap  = Object.fromEntries(liveData.filter(isBBLMatch).map(m => [m.id, m]))

  // Only fetch match_info for completed matches not already in Firestore
  const needsHydration = fixtures.filter(m => m.matchEnded && !scoredMap[m.id])
  const hydrated = {}
  const BATCH = 10
  for (let i = 0; i < needsHydration.length; i += BATCH) {
    const batch = needsHydration.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(m => apiGet(`match_info?id=${m.id}`, apiKey)))
    results.forEach((r, j) => { if (r.status === 'fulfilled') hydrated[batch[j].id] = r.value })
  }

  const seen = new Set()
  const games = fixtures
    .filter(m => m?.id && !seen.has(m.id) && seen.add(m.id))
    .map(m => {
      if (scoredMap[m.id]) {
        const g = scoredMap[m.id]
        const dateStr = g.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        return {
          ...g,
          highlightUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${g.awayTeam.name} vs ${g.homeTeam.name} BBL highlights ${dateStr}`)}`,
        }
      }
      return normalizeMatch(liveMap[m.id] || hydrated[m.id] || m)  // fresh from API
    })
    .filter(Boolean)
    .sort((a, b) => b.gameDate - a.gameDate)

  await saveToFirestore(games, seriesId)
  return { games, seriesId, fetched: needsHydration.length }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Returns { games: Game[], updatedAt: Date | null }
export async function fetchBBLGames(apiKey) {
  const session = readSession()
  if (session) return session

  const cached = await loadFromFirestore()
  if (cached?.games?.length) {
    const result = { games: cached.games, updatedAt: cached.updatedAt }
    writeSession(result)
    return result
  }

  // No Firestore data — return empty; user must click Update to fetch
  return { games: [], updatedAt: null }
}

// Always fetches fresh data, reusing existing Firestore scores where possible.
// Returns { games: Game[], updatedAt: Date }
export async function refreshBBLGames(apiKey) {
  const existing = await loadFromFirestore()
  const { games, fetched } = await fetchFromAPI(apiKey, {
    cachedSeriesId: existing?.seriesId ?? null,
    existingGames:  existing?.games ?? [],
  })
  const result = { games, updatedAt: new Date(), fetched }
  clearSession()
  writeSession(result)
  return result
}
