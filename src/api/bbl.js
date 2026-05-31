const BASE = 'https://api.cricapi.com/v1'

const BBL_TEAMS = new Set([
  'Adelaide Strikers', 'Brisbane Heat', 'Hobart Hurricanes',
  'Melbourne Renegades', 'Melbourne Stars', 'Perth Scorchers',
  'Sydney Sixers', 'Sydney Thunder',
])

// Abbreviation map for display
const ABBR = {
  'Adelaide Strikers': 'STR', 'Brisbane Heat': 'HEA', 'Hobart Hurricanes': 'HUR',
  'Melbourne Renegades': 'REN', 'Melbourne Stars': 'STA', 'Perth Scorchers': 'SCO',
  'Sydney Sixers': 'SIX', 'Sydney Thunder': 'THU',
}

// Team logo URLs from ESPN Cricinfo (by searching their cricket team pages)
const LOGOS = {
  'Adelaide Strikers':   'https://a.espncdn.com/i/teamlogos/cricket/500/strikers.png',
  'Brisbane Heat':       'https://a.espncdn.com/i/teamlogos/cricket/500/heat.png',
  'Hobart Hurricanes':   'https://a.espncdn.com/i/teamlogos/cricket/500/hurricanes.png',
  'Melbourne Renegades': 'https://a.espncdn.com/i/teamlogos/cricket/500/renegades.png',
  'Melbourne Stars':     'https://a.espncdn.com/i/teamlogos/cricket/500/stars.png',
  'Perth Scorchers':     'https://a.espncdn.com/i/teamlogos/cricket/500/scorchers.png',
  'Sydney Sixers':       'https://a.espncdn.com/i/teamlogos/cricket/500/sixers.png',
  'Sydney Thunder':      'https://a.espncdn.com/i/teamlogos/cricket/500/thunder.png',
}

function isBBL(match) {
  const name = (match.name || '').toLowerCase()
  const teams = match.teams || []
  return (
    name.includes('big bash') ||
    name.includes(' bbl') ||
    name.includes('bbl ') ||
    teams.some(t => BBL_TEAMS.has(t))
  )
}

function parseScore(scoreArr, teamName) {
  if (!scoreArr?.length) return null
  // CricAPI score: [{ r, w, o, inning: "Team Inning 1" }]
  const inning = scoreArr.find(s => (s.inning || '').toLowerCase().includes(teamName.toLowerCase().split(' ')[0]))
  return inning ? parseInt(inning.r) || 0 : null
}

function normalizeMatch(match) {
  const teams = match.teams || []
  if (teams.length < 2) return null
  const [home, away] = teams

  if (!BBL_TEAMS.has(home) && !BBL_TEAMS.has(away)) return null

  const isLive = match.matchStarted && !match.matchEnded
  const isFinal = match.matchEnded

  const homeScore = isFinal || isLive ? parseScore(match.score, home) : null
  const awayScore = isFinal || isLive ? parseScore(match.score, away) : null

  const dateStr = match.dateTimeGMT || match.date
  const gameDate = dateStr ? new Date(dateStr) : new Date()

  return {
    id: match.id,
    league: 'bbl',
    homeTeam: {
      id: home,
      name: home,
      abbreviation: ABBR[home] || home.slice(0, 3).toUpperCase(),
      logo: LOGOS[home] || null,
    },
    awayTeam: {
      id: away,
      name: away,
      abbreviation: ABBR[away] || away.slice(0, 3).toUpperCase(),
      logo: LOGOS[away] || null,
    },
    homeScore,
    awayScore,
    status: isLive ? 'live' : isFinal ? 'final' : 'scheduled',
    statusDetail: match.status || (isLive ? 'Live' : isFinal ? 'Final' : 'Scheduled'),
    gameDate,
    gameType: 'Big Bash League',
    highlightUrl: null,
    venue: match.venue || null,
  }
}

export async function fetchBBLGames(apiKey) {
  // Fetch current/recent matches and recent completed matches in parallel
  const [currentRes, matchesRes] = await Promise.allSettled([
    fetch(`${BASE}/currentMatches?apikey=${apiKey}&offset=0`).then(r => r.json()),
    fetch(`${BASE}/matches?apikey=${apiKey}&offset=0`).then(r => r.json()),
  ])

  const all = []
  for (const res of [currentRes, matchesRes]) {
    if (res.status === 'fulfilled') {
      const data = res.value
      if (data.status !== 'success') {
        // Surface the first meaningful error
        throw new Error(data.message || data.reason || 'CricAPI error — check your API key')
      }
      all.push(...(data.data || []))
    }
  }

  // Deduplicate and filter to BBL only
  const seen = new Set()
  return all
    .filter(m => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return isBBL(m)
    })
    .map(normalizeMatch)
    .filter(Boolean)
    .sort((a, b) => b.gameDate - a.gameDate)
}
