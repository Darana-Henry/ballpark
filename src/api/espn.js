import { getDifficultyRating } from '../utils/difficulty'

const BASE = 'https://site.api.espn.com/apis/site/v2/sports'

async function fetchESPN(path, params = {}) {
  const url = new URL(`${BASE}/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`ESPN API error ${res.status}`)
  return res.json()
}

function normalizeEvent(event, league) {
  const comp = event.competitions?.[0]
  if (!comp) return null

  const home = comp.competitors.find(c => c.homeAway === 'home')
  const away = comp.competitors.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const state = event.status?.type?.state ?? comp.status?.type?.state
  const isLive = state === 'in'
  const isFinal = state === 'post'

  const gameTypeNote = comp.notes?.find(n => n.type === 'event')?.headline
    || comp.notes?.[0]?.headline
    || (event.season?.type === 3 ? 'Playoffs' : event.season?.type === 5 ? 'Play-In' : 'Regular Season')

  return {
    id: event.id,
    league,
    homeTeam: {
      id: home.team.id,
      name: home.team.displayName,
      abbreviation: home.team.abbreviation,
      logo: home.team.logo || null,
    },
    awayTeam: {
      id: away.team.id,
      name: away.team.displayName,
      abbreviation: away.team.abbreviation,
      logo: away.team.logo || null,
    },
    homeScore: (isLive || isFinal) ? (parseInt(home.score?.displayValue ?? home.score) || 0) : null,
    awayScore: (isLive || isFinal) ? (parseInt(away.score?.displayValue ?? away.score) || 0) : null,
    status: isLive ? 'live' : isFinal ? 'final' : 'scheduled',
    statusDetail: event.status?.type?.shortDetail ?? comp.status?.type?.shortDetail ?? '',
    gameDate: new Date(event.date),
    gameType: gameTypeNote,
    highlightUrl: isFinal
      ? `https://www.espn.com/${league}/game/_/gameId/${event.id}`
      : (isLive ? `https://www.espn.com/${league}/game/_/gameId/${event.id}` : null),
    venue: comp.venue?.fullName || null,
  }
}

// ─── NBA ─────────────────────────────────────────────────────────────────────

const NBA_LAKERS_ID = '13'

function nbaYoutubeUrl(awayName, homeName, gameDate) {
  const away = awayName.split(' ').pop()
  const home = homeName.split(' ').pop()
  const date = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${away} ${home} highlights ${date} NBA`)}`
}

// Lakers full season + all playoff games
export async function fetchNBAGames() {
  const currentYear = new Date().getFullYear()
  const season = new Date().getMonth() >= 9 ? currentYear + 1 : currentYear

  // Playoffs run Apr–Jun of the season end year; date range gets all played + upcoming games
  const playoffDates = `${season}0401-${season}0715`

  const [regularData, playoffData, scoreboardData, standings] = await Promise.all([
    fetchESPN(`basketball/nba/teams/${NBA_LAKERS_ID}/schedule`, { season, seasontype: 2 }),
    fetchESPN('basketball/nba/scoreboard', { seasontype: 3, dates: playoffDates, limit: 500 }).catch(() => ({ events: [] })),
    fetchESPN('basketball/nba/scoreboard', { limit: 100 }).catch(() => ({ events: [] })),
    fetchNBAStandings().catch(() => null),
  ])

  // The schedule/scoreboard endpoints don't carry opponent win-loss records
  // on their competitor objects at all, so difficulty is looked up from
  // standings by team id instead, joined in below.
  const teamPctMap = new Map(
    (standings?.divisions ?? []).flatMap(d => d.teams).map(t => [t.teamId, t.pct])
  )

  // ESPN ignores seasontype when dates param is set — filter manually
  // season.type: 2=regular, 3=postseason, 5=play-in
  const isPostseason = e => e.season?.type === 3 || e.season?.type === 5

  const playoffEvents = (playoffData.events || []).filter(isPostseason)

  // From live scoreboard: keep Lakers regular season games (live scores) + any postseason
  const liveEvents = (scoreboardData.events || []).filter(e => {
    if (isPostseason(e)) return true
    const comps = e.competitions?.[0]?.competitors || []
    return comps.some(c => c.team?.id === NBA_LAKERS_ID)
  })

  const seen = new Set()
  return [
    ...liveEvents,
    ...(regularData.events || []),
    ...playoffEvents,
  ]
    .map(e => {
      const g = normalizeEvent(e, 'nba')
      if (!g) return null
      const isHome = g.homeTeam.id === NBA_LAKERS_ID
      const isAway = g.awayTeam.id === NBA_LAKERS_ID
      const lakersTeam = isHome ? 'home' : isAway ? 'away' : null
      const isPlayoff = e.season?.type === 3 || e.season?.type === 5
      const oppId = lakersTeam === 'home' ? g.awayTeam.id : lakersTeam === 'away' ? g.homeTeam.id : null
      const oppPct = oppId ? teamPctMap.get(oppId) : undefined
      return {
        ...g,
        lakersTeam,
        difficulty: oppPct != null ? getDifficultyRating(oppPct, isPlayoff) : null,
        highlightUrl: g.status === 'final'
          ? nbaYoutubeUrl(g.awayTeam.name, g.homeTeam.name, g.gameDate)
          : (g.status === 'live' ? `https://www.espn.com/nba/game/_/gameId/${g.id}` : null),
      }
    })
    .filter(g => {
      if (!g || seen.has(g.id)) return false
      seen.add(g.id)
      return true
    })
    .sort((a, b) => a.gameDate - b.gameDate)
}

// Hardcoded NBA division membership — abbreviations match ESPN API exactly
const NBA_DIV_MAP = {
  BOS: 'Atlantic', BKN: 'Atlantic', NY:   'Atlantic', PHI: 'Atlantic', TOR:  'Atlantic',
  CHI: 'Central',  CLE: 'Central',  DET:  'Central',  IND: 'Central',  MIL:  'Central',
  ATL: 'Southeast',CHA: 'Southeast',MIA:  'Southeast',ORL: 'Southeast',WSH:  'Southeast',
  DEN: 'Northwest',OKC: 'Northwest',POR:  'Northwest',UTAH:'Northwest', MIN:  'Northwest',
  GS:  'Pacific',  LAC: 'Pacific',  LAL:  'Pacific',  PHX: 'Pacific',  SAC:  'Pacific',
  DAL: 'Southwest',HOU: 'Southwest',MEM:  'Southwest',NO:  'Southwest', SA:   'Southwest',
}
const NBA_DIV_CONF = {
  Atlantic: 'East', Central: 'East', Southeast: 'East',
  Northwest: 'West', Pacific: 'West', Southwest: 'West',
}
const NBA_DIV_ORDER = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest']

export async function fetchNBAStandings() {
  const currentYear = new Date().getFullYear()
  const season = new Date().getMonth() >= 9 ? currentYear + 1 : currentYear

  const res = await fetch(
    `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${season}&seasontype=2`
  )
  if (!res.ok) throw new Error(`NBA standings error ${res.status}`)
  const data = await res.json()

  const parseStat = (stats, name) => stats?.find(s => s.name === name)?.value ?? 0

  // Flatten all entries from conference-level API response
  const allEntries = (data.children || []).flatMap(conf =>
    (conf.standings?.entries || []).map(entry => ({
      teamId: entry.team.id,
      teamName: entry.team.displayName,
      abbreviation: entry.team.abbreviation,
      logo: entry.team.logos?.[0]?.href || null,
      wins: Math.round(parseStat(entry.stats, 'wins')),
      losses: Math.round(parseStat(entry.stats, 'losses')),
      pct: parseStat(entry.stats, 'winPercent'),
    }))
  )

  // Group into 6 divisions using hardcoded map
  const divMap = {}
  for (const team of allEntries) {
    const divName = NBA_DIV_MAP[team.abbreviation] || 'Other'
    if (!divMap[divName]) divMap[divName] = []
    divMap[divName].push(team)
  }

  const divisions = Object.entries(divMap)
    .map(([name, teams]) => ({
      id: name,
      name,
      league: NBA_DIV_CONF[name] || 'East',
      teams: teams
        .sort((a, b) => b.pct - a.pct || a.losses - b.losses)
        .map((t, i) => ({ ...t, divisionRank: i + 1 })),
    }))
    .sort((a, b) => NBA_DIV_ORDER.indexOf(a.name) - NBA_DIV_ORDER.indexOf(b.name))

  const computeSeeds = league =>
    divisions
      .filter(d => d.league === league)
      .flatMap(d => d.teams)
      .sort((a, b) => b.pct - a.pct || a.losses - b.losses)
      .slice(0, 8)
      .map((t, i) => ({ ...t, seed: i + 1 }))

  return { divisions, eastSeeds: computeSeeds('East'), westSeeds: computeSeeds('West') }
}

const NBA_CACHE_KEY = 'ballpark_nba_boxscores_v1'
const readNBACache = () => { try { return JSON.parse(localStorage.getItem(NBA_CACHE_KEY) || '{}') } catch { return {} } }
const writeNBACache = c => { try { localStorage.setItem(NBA_CACHE_KEY, JSON.stringify(c)) } catch {} }

async function fetchNBABoxscore(gameId) {
  const cache = readNBACache()
  if (cache[gameId]) return cache[gameId]
  const data = await fetchESPN('basketball/nba/summary', { event: gameId })
  cache[gameId] = data
  writeNBACache(cache)
  return data
}

export async function fetchNBAStatsFromWatchedGames(watchedList) {
  const lakersGames = watchedList.filter(
    g => g.homeTeamId === NBA_LAKERS_ID || g.awayTeamId === NBA_LAKERS_ID
  )
  if (!lakersGames.length) return null

  const boxscores = await Promise.all(
    lakersGames.map(g => fetchNBABoxscore(g.gameId).catch(() => null))
  )

  const players = {}
  for (const bs of boxscores) {
    if (!bs?.boxscore?.players) continue
    const lakersBs = bs.boxscore.players.find(p => p.team?.id === NBA_LAKERS_ID)
    if (!lakersBs?.statistics?.[0]) continue

    const { names = [], athletes = [] } = lakersBs.statistics[0]
    const idx = n => names.indexOf(n)
    const ptsI = idx('PTS'), rebI = idx('REB'), astI = idx('AST'), minI = idx('MIN')

    for (const { athlete, stats = [], didNotPlay } of athletes) {
      if (didNotPlay || !athlete?.id) continue
      const mins = parseFloat((stats[minI] || '0').split(':')[0]) || 0
      if (mins < 5) continue
      const id = athlete.id
      if (!players[id]) players[id] = {
        id, name: athlete.displayName,
        photo: athlete.headshot?.href || null,
        pts: 0, reb: 0, ast: 0, games: 0,
      }
      players[id].pts  += parseFloat(stats[ptsI]) || 0
      players[id].reb  += parseFloat(stats[rebI]) || 0
      players[id].ast  += parseFloat(stats[astI]) || 0
      players[id].games += 1
    }
  }

  const minGames = Math.max(3, Math.round(lakersGames.length * 0.3))
  const playerList = Object.values(players)
    .filter(p => p.games >= minGames)
    .map(p => ({
      ...p,
      ppg: (p.pts / p.games).toFixed(1),
      rpg: (p.reb / p.games).toFixed(1),
      apg: (p.ast / p.games).toFixed(1),
      ptsPerGame: p.pts / p.games,
      rebPerGame: p.reb / p.games,
      astPerGame: p.ast / p.games,
    }))

  return {
    gameCount: lakersGames.length,
    ptsLeaders: [...playerList].sort((a, b) => b.ptsPerGame - a.ptsPerGame).slice(0, 3),
    rebLeaders: [...playerList].sort((a, b) => b.rebPerGame - a.rebPerGame).slice(0, 3),
    astLeaders: [...playerList].sort((a, b) => b.astPerGame - a.astPerGame).slice(0, 3),
  }
}

// ─── NFL ─────────────────────────────────────────────────────────────────────

function nflYoutubeUrl(awayName, homeName, gameDate) {
  const away = awayName.split(' ').pop()
  const home = homeName.split(' ').pop()
  const date = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${away} ${home} highlights ${date} NFL`)}`
}

function nflGameDifficulty(event, isPlayoff) {
  const comp = event.competitions?.[0]
  if (!comp) return null
  const pcts = (comp.competitors || []).map(c => {
    const rec = c.records?.find(r => r.type === 'total' || r.name === 'overall')?.summary
             || c.record?.find(r => r.type === 'total')?.displayValue
    if (!rec) return null
    const [w, l] = rec.split('-').map(Number)
    return (w + l) > 0 ? w / (w + l) : null
  }).filter(p => p !== null)
  if (!pcts.length) return null
  return getDifficultyRating(pcts.reduce((a, b) => a + b, 0) / pcts.length, isPlayoff)
}

export async function fetchNFLGames() {
  const now = new Date()
  // NFL schedules are announced ~mid-May for the season kicking off that
  // September — months before games start — so switch over as soon as the
  // new season's schedule would plausibly exist, not once games begin.
  const seasonStartYear = now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1

  // ESPN's scoreboard endpoint silently ignores season+week params for a
  // season that hasn't "started" per its own internal clock — season=2026,
  // 2027, even 2020 all returned the same stale, already-concluded season
  // regardless of the value passed. Querying by date range instead reliably
  // returns the real, current data, and covers the whole season (preseason
  // through Super Bowl) in a single call instead of 23 separate ones.
  const start = `${seasonStartYear}0801`
  const end   = `${seasonStartYear + 1}0301`
  const events = await fetchESPN('football/nfl/scoreboard', { dates: `${start}-${end}`, limit: 500 })
    .then(d => d.events || [])
    .catch(() => [])

  const seen = new Set()

  return events
    .filter(e => e.season?.type !== 1) // exclude preseason — app scope is regular season + playoffs
    .map(e => {
      const g = normalizeEvent(e, 'nfl')
      if (!g) return null
      const isPlayoff = e.season?.type === 3
      return {
        ...g,
        difficulty: nflGameDifficulty(e, isPlayoff),
        highlightUrl: g.status === 'final'
          ? nflYoutubeUrl(g.awayTeam.name, g.homeTeam.name, g.gameDate)
          : (g.status === 'live' ? `https://www.espn.com/nfl/game/_/gameId/${g.id}` : null),
      }
    })
    .filter(g => {
      if (!g || seen.has(g.id)) return false
      seen.add(g.id)
      return true
    })
    .sort((a, b) => a.gameDate - b.gameDate)
}

const NFL_CACHE_KEY = 'ballpark_nfl_boxscores_v1'
const readNFLCache = () => { try { return JSON.parse(localStorage.getItem(NFL_CACHE_KEY) || '{}') } catch { return {} } }
const writeNFLCache = c => { try { localStorage.setItem(NFL_CACHE_KEY, JSON.stringify(c)) } catch {} }

async function fetchNFLBoxscore(gameId) {
  const cache = readNFLCache()
  if (cache[gameId]) return cache[gameId]
  const data = await fetchESPN('football/nfl/summary', { event: gameId })
  cache[gameId] = data
  writeNFLCache(cache)
  return data
}

export async function fetchNFLStatsFromWatchedGames(watchedList) {
  const nflGames = watchedList.filter(g => g.league === 'nfl')
  if (!nflGames.length) return null

  const boxscores = await Promise.all(
    nflGames.map(g => fetchNFLBoxscore(g.gameId).catch(() => null))
  )

  const passers = {}, rushers = {}, receivers = {}

  for (const bs of boxscores) {
    if (!bs?.boxscore?.players) continue
    for (const teamData of bs.boxscore.players) {
      const teamAbbr = teamData.team?.abbreviation || '?'
      for (const { name, keys = [], athletes = [] } of teamData.statistics || []) {
        const ydsI = keys.indexOf(name === 'passing' ? 'passingYards' : name === 'rushing' ? 'rushingYards' : 'receivingYards')
        const tdI  = keys.indexOf(name === 'passing' ? 'passingTouchdowns' : name === 'rushing' ? 'rushingTouchdowns' : 'receivingTouchdowns')
        if (ydsI < 0) continue
        const map = name === 'passing' ? passers : name === 'rushing' ? rushers : name === 'receiving' ? receivers : null
        if (!map) continue
        for (const { athlete, stats = [] } of athletes) {
          if (!athlete?.id) continue
          const yds = parseInt(stats[ydsI]) || 0
          const tds = parseInt(stats[tdI] ?? -1) || 0
          if (yds === 0 && tds === 0) continue
          const id = String(athlete.id)
          if (!map[id]) map[id] = { id, name: athlete.displayName, photo: athlete.headshot?.href || null, team: teamAbbr, yds: 0, tds: 0, games: 0 }
          map[id].yds  += yds
          map[id].tds  += tds
          map[id].games += 1
        }
      }
    }
  }

  const top7 = (map, key) => Object.values(map).sort((a, b) => b[key] - a[key]).slice(0, 7)

  return {
    gameCount: nflGames.length,
    passingYds:   top7(passers,   'yds'),
    passingTds:   top7(passers,   'tds'),
    rushingYds:   top7(rushers,   'yds'),
    rushingTds:   top7(rushers,   'tds'),
    receivingYds: top7(receivers, 'yds'),
    receivingTds: top7(receivers, 'tds'),
  }
}
