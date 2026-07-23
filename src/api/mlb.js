import { getDifficultyRating } from '../utils/difficulty'

const BASE = 'https://statsapi.mlb.com/api/v1'
const DODGERS_ID = 119
const SEASON = new Date().getFullYear()

const GAME_TYPE_LABELS = {
  R: 'Regular Season',
  F: 'Wild Card',
  D: 'Division Series',
  L: 'League Championship',
  W: 'World Series',
  S: 'Spring Training',
  C: 'Championship',
  A: 'All-Star',
}

const PLAYOFF_TYPES = new Set(['F', 'D', 'L', 'W', 'C'])

function youtubeHighlightUrl(awayName, homeName, gameDate) {
  const away = awayName.split(' ').pop()
  const home = homeName.split(' ').pop()
  const date = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const q = encodeURIComponent(`${away} ${home} highlights ${date} MLB`)
  return `https://www.youtube.com/results?search_query=${q}`
}

function normalizeGame(game) {
  const state = game.status?.abstractGameState
  const isLive = state === 'Live'
  const isFinal = state === 'Final'
  const isPlayoff = PLAYOFF_TYPES.has(game.gameType)

  const home = game.teams.home
  const away = game.teams.away
  const gameDate = new Date(game.gameDate)

  const isDodgersHome = home.team.id === DODGERS_ID
  const isDodgersAway = away.team.id === DODGERS_ID
  const dodgersTeam = isDodgersHome ? 'home' : isDodgersAway ? 'away' : null

  // Difficulty from opponent's record at game time (included in schedule response)
  let difficulty = null
  if (dodgersTeam) {
    const opp = dodgersTeam === 'home' ? away : home
    const pct = parseFloat(opp.leagueRecord?.pct || '0')
    difficulty = getDifficultyRating(pct, isPlayoff)
  }

  const toPitcher = (p) => p
    ? { id: p.id, name: p.fullName, lastName: p.fullName.split(' ').slice(-1)[0] }
    : null

  return {
    id: String(game.gamePk),
    league: 'mlb',
    homeTeam: {
      id: String(home.team.id),
      name: home.team.name,
      abbreviation: home.team.abbreviation || home.team.name.slice(0, 3).toUpperCase(),
      logo: `https://www.mlbstatic.com/team-logos/${home.team.id}.svg`,
    },
    awayTeam: {
      id: String(away.team.id),
      name: away.team.name,
      abbreviation: away.team.abbreviation || away.team.name.slice(0, 3).toUpperCase(),
      logo: `https://www.mlbstatic.com/team-logos/${away.team.id}.svg`,
    },
    homeScore: (isFinal || isLive) ? (home.score ?? null) : null,
    awayScore: (isFinal || isLive) ? (away.score ?? null) : null,
    status: isLive ? 'live' : isFinal ? 'final' : 'scheduled',
    statusDetail: game.status?.detailedState || '',
    gameDate,
    gameType: GAME_TYPE_LABELS[game.gameType] || game.gameType,
    highlightUrl: isFinal ? youtubeHighlightUrl(away.team.name, home.team.name, gameDate) : null,
    venue: game.venue?.name || null,
    dodgersTeam,
    difficulty,
    probablePitchers: {
      home: toPitcher(home.probablePitcher),
      away: toPitcher(away.probablePitcher),
    },
  }
}

async function fetchSchedule(params) {
  const url = new URL(`${BASE}/schedule`)
  const allParams = {
    sportId: 1,
    season: SEASON,
    hydrate: 'probablePitcher',
    ...params,
  }
  Object.entries(allParams).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`MLB API error ${res.status}`)
  const data = await res.json()
  return data.dates?.flatMap(d => d.games) ?? []
}

export async function fetchMLBGames() {
  const [dodgers, playoffs] = await Promise.all([
    fetchSchedule({ teamId: DODGERS_ID, gameType: 'R,F,D,L,W,C' }),
    fetchSchedule({ gameType: 'F,D,L,W,C' }),
  ])
  const seen = new Set()
  return [...dodgers, ...playoffs]
    .map(normalizeGame)
    .filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true })
    .sort((a, b) => a.gameDate - b.gameDate)
}

const DIVISION_NAMES = {
  200: 'AL West', 201: 'AL East', 202: 'AL Central',
  203: 'NL West', 204: 'NL East', 205: 'NL Central',
}
const NL_DIVISION_IDS = new Set([203, 204, 205])

export async function fetchMLBStandings() {
  // leagueId 103 = AL, 104 = NL — fetch both at once
  const res = await fetch(
    `${BASE}/standings?leagueId=103,104&season=${SEASON}&standingsType=regularSeason`
  )
  if (!res.ok) throw new Error(`MLB standings error ${res.status}`)
  const data = await res.json()

  const parseTeam = tr => ({
    teamId: String(tr.team.id),
    teamName: tr.team.name,
    wins: tr.wins ?? 0,
    losses: tr.losses ?? 0,
    pct: parseFloat(tr.leagueRecord?.pct || '0'),
    pctDisplay: tr.leagueRecord?.pct || '.000',
    gamesBack: tr.gamesBack === '-' ? '—' : (tr.gamesBack ?? '—'),
    divisionRank: parseInt(tr.divisionRank) || 99,
  })

  const divisions = (data.records ?? []).map(r => ({
    id: r.division?.id,
    name: DIVISION_NAMES[r.division?.id] || r.division?.name || 'Unknown',
    league: NL_DIVISION_IDS.has(r.division?.id) ? 'NL' : 'AL',
    teams: (r.teamRecords ?? [])
      .map(parseTeam)
      .sort((a, b) => a.divisionRank - b.divisionRank),
  }))

  // Compute playoff seeds (6 per league: 3 div winners + 3 wild cards)
  const computeSeeds = league => {
    const leagueDivs = divisions.filter(d => d.league === league)
    const divWinners = leagueDivs
      .map(d => ({ ...d.teams[0], divisionName: d.name }))
      .sort((a, b) => b.pct - a.pct)
      .map((t, i) => ({ ...t, seed: i + 1, qualifier: 'Division Winner' }))

    const wildCards = leagueDivs
      .flatMap(d => d.teams.slice(1).map(t => ({ ...t, divisionName: d.name })))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3)
      .map((t, i) => ({ ...t, seed: i + 4, qualifier: 'Wild Card' }))

    return [...divWinners, ...wildCards]
  }

  return {
    divisions,
    nlSeeds: computeSeeds('NL'),
    alSeeds: computeSeeds('AL'),
  }
}

// ─── Watched-game stats ───────────────────────────────────────────────────────

function ipToDecimal(ipStr) {
  const [whole, thirds = '0'] = String(ipStr || '0').split('.')
  return parseInt(whole) + parseInt(thirds) / 3
}

function decimalToIPDisplay(decimal) {
  const whole = Math.floor(decimal)
  const thirds = Math.round((decimal - whole) * 3)
  return thirds === 3 ? `${whole + 1}.0` : `${whole}.${thirds}`
}

const BOXSCORE_CACHE_KEY = 'ballpark_boxscores_v1'

function readCache() {
  try { return JSON.parse(localStorage.getItem(BOXSCORE_CACHE_KEY) || '{}') } catch { return {} }
}
function writeCache(cache) {
  try { localStorage.setItem(BOXSCORE_CACHE_KEY, JSON.stringify(cache)) } catch {}
}

async function fetchBoxscore(gamePk) {
  const cache = readCache()
  if (cache[gamePk]) return cache[gamePk]
  const res = await fetch(`${BASE}/game/${gamePk}/boxscore`)
  if (!res.ok) return null
  const data = await res.json()
  cache[gamePk] = data
  writeCache(cache)
  return data
}

const photo = id =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`

// watchedList = array of Firestore game docs filtered to MLB
export async function fetchStatsFromWatchedGames(watchedList) {
  const dodgersGames = watchedList.filter(
    g => g.homeTeamId === String(DODGERS_ID) || g.awayTeamId === String(DODGERS_ID)
  )
  if (!dodgersGames.length) return null

  const boxscores = await Promise.all(
    dodgersGames.map(async g => {
      const data = await fetchBoxscore(g.gameId).catch(() => null)
      if (!data) return null
      const dodgersTeam = g.homeTeamId === String(DODGERS_ID) ? 'home' : 'away'
      return { data, dodgersTeam }
    })
  )

  const batters = {}   // id → aggregated batter line
  const pitchers = {}  // id → aggregated pitcher line

  for (const bs of boxscores) {
    if (!bs?.data?.teams) continue
    const team = bs.data.teams[bs.dodgersTeam]
    if (!team) continue

    const batterIds = new Set(team.batters || [])
    const pitcherIds = team.pitchers || []

    // Aggregate batting
    for (const [key, player] of Object.entries(team.players || {})) {
      const id = player.person?.id
      if (!id || !batterIds.has(id)) continue
      const b = player.stats?.batting
      if (!b || (b.atBats ?? 0) === 0) continue

      if (!batters[id]) batters[id] = {
        id, name: player.person.fullName, photo: photo(id),
        ab: 0, h: 0, hr: 0, rbi: 0,
        bb: 0, doubles: 0, triples: 0, tb: 0, sf: 0, hbp: 0,
        games: 0,
      }
      const bt = batters[id]
      bt.ab     += b.atBats         ?? 0
      bt.h      += b.hits           ?? 0
      bt.hr     += b.homeRuns       ?? 0
      bt.rbi    += b.rbi            ?? 0
      bt.bb     += b.baseOnBalls    ?? 0
      bt.doubles += b.doubles       ?? 0
      bt.triples += b.triples       ?? 0
      bt.tb     += b.totalBases     ?? 0
      bt.sf     += b.sacFlies       ?? 0
      bt.hbp    += b.hitByPitch     ?? 0
      bt.games  += 1
    }

    // Aggregate pitching
    for (let i = 0; i < pitcherIds.length; i++) {
      const pid = pitcherIds[i]
      const player = team.players?.[`ID${pid}`]
      if (!player) continue
      const p = player.stats?.pitching
      if (!p) continue

      if (!pitchers[pid]) pitchers[pid] = {
        id: pid, name: player.person.fullName, photo: photo(pid),
        ip: 0, er: 0, wins: 0, losses: 0, so: 0, bb: 0, hitsAllowed: 0,
        games: 0, starts: 0,
      }
      const pt = pitchers[pid]
      pt.ip    += ipToDecimal(p.inningsPitched)
      pt.er    += p.earnedRuns   ?? 0
      pt.wins  += p.wins         ?? 0
      pt.losses += p.losses      ?? 0
      pt.so    += p.strikeOuts   ?? 0
      pt.bb    += p.baseOnBalls  ?? 0
      pt.hitsAllowed += p.hits   ?? 0
      pt.games += 1
      if (i === 0) pt.starts += 1  // first pitcher listed = starter
    }
  }

  const totalGames = dodgersGames.length
  const minHitterGames = Math.max(3, Math.round(totalGames * 0.3))
  const hitterList = Object.values(batters)
    .filter(b => b.ab >= 10 && b.games >= minHitterGames)
    .map(b => {
      const ba = b.ab > 0 ? b.h / b.ab : 0
      const obp = (b.ab + b.bb + b.hbp + b.sf) > 0
        ? (b.h + b.bb + b.hbp) / (b.ab + b.bb + b.hbp + b.sf)
        : 0
      const slg = b.ab > 0 ? b.tb / b.ab : 0
      return {
        ...b,
        ba,
        baDisplay: b.ab > 0 ? ba.toFixed(3).replace(/^0/, '') : '---',
        ops: (obp + slg).toFixed(3).replace(/^0/, ''),
      }
    })

  const pitcherList = Object.values(pitchers)
    .filter(p => p.ip >= 1)
    .map(p => {
      const era = p.ip > 0 ? (p.er * 9) / p.ip : (p.er > 0 ? Infinity : 0)
      const whip = p.ip > 0 ? (p.bb + p.hitsAllowed) / p.ip : 0
      return {
        ...p,
        era,
        eraDisplay: era === Infinity ? '∞' : era.toFixed(2),
        whip: whip > 0 ? whip.toFixed(2) : '---',
        ip: decimalToIPDisplay(p.ip),
        strikeouts: p.so,
        gamesStarted: p.starts,
      }
    })

  const starters = pitcherList.filter(p => p.starts >= 1)

  return {
    gameCount: dodgersGames.length,
    baLeaders:   [...hitterList].sort((a, b) => b.ba  - a.ba).slice(0, 3),
    hrLeaders:   [...hitterList].sort((a, b) => b.hr  - a.hr).slice(0, 3),
    rbiLeaders:  [...hitterList].sort((a, b) => b.rbi - a.rbi).slice(0, 3),
    eraLeaders:  [...starters].sort((a, b) => a.era  - b.era).slice(0, 3),
    winsLeaders: [...starters].sort((a, b) => b.wins - a.wins).slice(0, 3),
  }
}

// ─── Full-season stats (kept for future use) ──────────────────────────────────

export async function fetchDodgersPlayerStats() {
  const [hittingRes, pitchingRes] = await Promise.all([
    fetch(`${BASE}/stats?stats=season&group=hitting&teamId=${DODGERS_ID}&season=${SEASON}&sportId=1`),
    fetch(`${BASE}/stats?stats=season&group=pitching&teamId=${DODGERS_ID}&season=${SEASON}&sportId=1`),
  ])
  if (!hittingRes.ok || !pitchingRes.ok) throw new Error('MLB stats API error')
  const [hittingData, pitchingData] = await Promise.all([hittingRes.json(), pitchingRes.json()])

  const photo = id =>
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`

  const allHitters = (hittingData.stats?.[0]?.splits ?? [])
    .filter(s => (s.stat.atBats ?? 0) >= 30)
    .map(s => ({
      id: s.player.id,
      name: s.player.fullName,
      photo: photo(s.player.id),
      ba: parseFloat(s.stat.avg) || 0,
      baDisplay: s.stat.avg || '---',
      hr: s.stat.homeRuns ?? 0,
      rbi: s.stat.rbi ?? 0,
      ops: s.stat.ops || '---',
      games: s.stat.gamesPlayed ?? 0,
    }))

  const allPitchers = (pitchingData.stats?.[0]?.splits ?? [])
    .filter(s => parseFloat(s.stat.inningsPitched || '0') >= 10)
    .map(s => ({
      id: s.player.id,
      name: s.player.fullName,
      photo: photo(s.player.id),
      era: parseFloat(s.stat.era) ?? 99,
      eraDisplay: s.stat.era || '---',
      wins: s.stat.wins ?? 0,
      losses: s.stat.losses ?? 0,
      strikeouts: s.stat.strikeOuts ?? 0,
      ip: s.stat.inningsPitched || '0',
      whip: s.stat.whip || '---',
      games: s.stat.gamesPlayed ?? 0,
      gamesStarted: s.stat.gamesStarted ?? 0,
    }))

  // Starters only for ERA and wins
  const starters = allPitchers.filter(p => p.gamesStarted >= 3)

  return {
    baLeaders:   [...allHitters].sort((a, b) => b.ba - a.ba).slice(0, 3),
    hrLeaders:   [...allHitters].sort((a, b) => b.hr - a.hr).slice(0, 3),
    rbiLeaders:  [...allHitters].sort((a, b) => b.rbi - a.rbi).slice(0, 3),
    eraLeaders:  [...starters].sort((a, b) => a.era - b.era).slice(0, 3),
    winsLeaders: [...starters].sort((a, b) => b.wins - a.wins).slice(0, 3),
  }
}
