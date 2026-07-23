import { getDifficultyRating } from '../utils/difficulty'

const BASE_SOCCER = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
export const INTER_MIAMI_ID = '20232'

function youtubeUrl(awayName, homeName, date, competition) {
  const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${awayName} vs ${homeName} highlights ${dateStr} ${competition}`)}`
}

function normalizeEvent(event, overrideGameType, teamStandingsMap) {
  const comp = event.competitions?.[0]
  if (!comp) return null

  const home = comp.competitors.find(c => c.homeAway === 'home')
  const away = comp.competitors.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const state  = event.status?.type?.state
  const isLive = state === 'in'
  const isFinal = state === 'post'

  const seasonType = event.season?.type ?? 2
  const gameType   = overrideGameType ?? (seasonType === 3 ? 'MLS Cup Playoffs' : 'MLS Regular Season')

  // Difficulty is the opponent's points-per-game (3 pts/win is the standard
  // soccer convention), normalized to the same 0-1 scale win-pct uses
  // elsewhere — only meaningful when the opponent is in MLS's own standings
  // and has actually played games (cup opponents from other confederations
  // won't be, and correctly get no rating).
  const trackedTeam = home.team.id === INTER_MIAMI_ID ? 'home' : away.team.id === INTER_MIAMI_ID ? 'away' : null
  const oppId = trackedTeam === 'home' ? away.team.id : trackedTeam === 'away' ? home.team.id : null
  const oppRow = oppId ? teamStandingsMap?.get(oppId) : null
  const gamesPlayed = oppRow ? parseInt(oppRow.gamesPlayed) || 0 : 0
  const oppScore = oppRow && gamesPlayed > 0 ? parseInt(oppRow.points) / (gamesPlayed * 3) : null
  const isPlayoff = gameType === 'MLS Cup Playoffs'

  return {
    id: event.id,
    league: 'mls',
    homeTeam: {
      id:           home.team.id,
      name:         home.team.displayName,
      abbreviation: home.team.abbreviation,
      logo:         home.team.logo ?? null,
    },
    awayTeam: {
      id:           away.team.id,
      name:         away.team.displayName,
      abbreviation: away.team.abbreviation,
      logo:         away.team.logo ?? null,
    },
    homeScore:    (isLive || isFinal) ? (parseInt(home.score) || 0) : null,
    awayScore:    (isLive || isFinal) ? (parseInt(away.score) || 0) : null,
    status:       isLive ? 'live' : isFinal ? 'final' : 'scheduled',
    statusDetail: event.status?.type?.shortDetail ?? '',
    gameDate:     new Date(event.date),
    gameType,
    difficulty:   oppScore != null ? getDifficultyRating(oppScore, isPlayoff) : null,
    highlightUrl: isFinal
      ? youtubeUrl(away.team.displayName, home.team.displayName, event.date, gameType)
      : isLive ? `https://www.espn.com/soccer/match/_/gameId/${event.id}` : null,
    venue: comp.venue?.fullName ?? null,
  }
}

async function fetchGamesForSlug(slug, startDate, endDate, overrideGameType = null, teamStandingsMap = null) {
  try {
    const res  = await fetch(`${BASE_SOCCER}/${slug}/scoreboard?dates=${startDate}-${endDate}&limit=300`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.events ?? [])
      .filter(e => e.competitions?.[0]?.competitors?.some(c => c.team?.id === INTER_MIAMI_ID))
      .map(e => normalizeEvent(e, overrideGameType, teamStandingsMap))
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function fetchMLSGames() {
  const year = new Date().getFullYear()

  const standings = await fetchMLSStandings().catch(() => [])
  const teamStandingsMap = new Map(
    standings.flatMap(conf => conf.entries).map(e => [e.teamId, e])
  )

  const results = await Promise.allSettled([
    // MLS regular season + playoffs in two chunks to avoid API result limits
    fetchGamesForSlug('usa.1', `${year}0201`, `${year}0630`, null, teamStandingsMap),
    fetchGamesForSlug('usa.1', `${year}0701`, `${year}1130`, null, teamStandingsMap),
    // Domestic & international cup competitions
    fetchGamesForSlug('usa.open',            `${year}0401`, `${year}0930`, 'US Open Cup', teamStandingsMap),
    fetchGamesForSlug('concacaf.champions',  `${year}0101`, `${year}0630`, 'CONCACAF Champions Cup', teamStandingsMap),
    fetchGamesForSlug('concacaf.leagues.cup',`${year}0601`, `${year}0930`, 'Leagues Cup', teamStandingsMap),
  ])

  const seen = new Set()
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(g => {
      if (!g || seen.has(g.id)) return false
      seen.add(g.id)
      return true
    })
    .sort((a, b) => a.gameDate - b.gameDate)
}

export async function fetchMLSStats() {
  const year = new Date().getFullYear()
  const res  = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/statistics?season=${year}&seasontype=2`
  )
  if (!res.ok) throw new Error(`MLS stats error ${res.status}`)
  const data = await res.json()

  return (data.stats ?? []).map(cat => ({
    name:        cat.name,
    displayName: cat.displayName,
    leaders: (cat.leaders ?? []).slice(0, 10).map(l => {
      const matchesMatch = (l.displayValue ?? '').match(/Matches?:\s*(\d+)/i)
      return {
        value:   Math.round(l.value),
        matches: matchesMatch ? parseInt(matchesMatch[1]) : null,
        athlete: {
          id:        l.athlete?.id,
          name:      l.athlete?.displayName,
          shortName: l.athlete?.shortName,
          photo:     l.athlete?.headshot?.href ?? null,
        },
      }
    }),
  }))
}

export async function fetchMLSStandings() {
  const res  = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/usa.1/standings')
  if (!res.ok) throw new Error(`MLS standings error ${res.status}`)
  const data = await res.json()

  return (data.children ?? []).map(conf => ({
    name: conf.name,
    entries: (conf.standings?.entries ?? []).map(e => {
      const stats = Object.fromEntries(
        (e.stats ?? []).map(s => [s.name, s.displayValue ?? String(s.value ?? '')])
      )
      const logo = e.team?.logos?.[0]?.href ?? null
      return {
        teamId:      e.team?.id,
        teamName:    e.team?.displayName,
        abbreviation: e.team?.abbreviation,
        logo,
        rank:        parseInt(stats.rank) || 99,
        gamesPlayed: stats.gamesPlayed ?? '0',
        wins:        stats.wins   ?? '0',
        draws:       stats.ties   ?? '0',
        losses:      stats.losses ?? '0',
        gf:          stats.pointsFor       ?? '0',
        ga:          stats.pointsAgainst   ?? '0',
        gd:          stats.pointDifferential ?? '0',
        points:      stats.points ?? '0',
        overall:     stats.overall ?? '',
      }
    }).sort((a, b) => a.rank - b.rank),
  }))
}
