const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
export const MAN_UNITED_ID = '360'

const COMPETITIONS = [
  { slug: 'eng.1',                name: 'Premier League'    },
  { slug: 'eng.fa',               name: 'FA Cup'            },
  { slug: 'eng.league_cup',       name: 'Carabao Cup'       },
  { slug: 'UEFA.CHAMPIONS',       name: 'Champions League'  },
  { slug: 'UEFA.EUROPA',          name: 'Europa League'     },
  { slug: 'UEFA.EUROPA.CONF',     name: 'Conference League' },
  { slug: 'eng.community_shield', name: 'Community Shield'  },
]

function youtubeUrl(awayName, homeName, date, competition) {
  const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${awayName} vs ${homeName} highlights ${dateStr} ${competition}`)}`
}

// English seasons run Aug–May; season 2025 = Aug 2025 – Jun 2026
function getSeason() {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

function normalizeEvent(event, competitionName) {
  const comp = event.competitions?.[0]
  if (!comp) return null

  const home = comp.competitors.find(c => c.homeAway === 'home')
  const away = comp.competitors.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const state = event.status?.type?.state
  const isLive = state === 'in'
  const isFinal = state === 'post'

  return {
    id: event.id,
    league: 'epl',
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
    gameType:     competitionName,
    highlightUrl: isFinal
      ? youtubeUrl(away.team.displayName, home.team.displayName, event.date, competitionName)
      : isLive ? `https://www.espn.com/soccer/match/_/gameId/${event.id}` : null,
    venue: comp.venue?.fullName ?? null,
  }
}

async function fetchCompetitionGames(slug, startDate, endDate, competitionName) {
  try {
    const res = await fetch(`${BASE}/${slug}/scoreboard?dates=${startDate}-${endDate}&limit=300`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.events ?? [])
      .filter(e => e.competitions?.[0]?.competitors?.some(c => c.team?.id === MAN_UNITED_ID))
      .map(e => normalizeEvent(e, competitionName))
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function fetchEPLGames() {
  const season   = getSeason()
  const startH1  = `${season}0715`
  const endH1    = `${season}1231`
  const startH2  = `${season + 1}0101`
  const endH2    = `${season + 1}0630`

  const fetches = COMPETITIONS.flatMap(({ slug, name }) => [
    fetchCompetitionGames(slug, startH1, endH1, name),
    fetchCompetitionGames(slug, startH2, endH2, name),
  ])

  const results = await Promise.allSettled(fetches)
  const seen    = new Set()

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

export async function fetchEPLStandings() {
  const res = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings')
  if (!res.ok) throw new Error(`EPL standings error ${res.status}`)
  const data = await res.json()

  function parseEntries(entries) {
    return (entries ?? []).map(e => {
      const stats = Object.fromEntries(
        (e.stats ?? []).map(s => [s.name, s.displayValue ?? String(s.value ?? '')])
      )
      return {
        teamId:      e.team?.id,
        teamName:    e.team?.displayName,
        abbreviation: e.team?.abbreviation,
        logo:        e.team?.logos?.[0]?.href ?? null,
        rank:        parseInt(stats.rank) || 99,
        gamesPlayed: stats.gamesPlayed ?? '0',
        wins:        stats.wins        ?? '0',
        draws:       stats.ties        ?? '0',
        losses:      stats.losses      ?? '0',
        gf:          stats.pointsFor   ?? '0',
        ga:          stats.pointsAgainst ?? '0',
        gd:          stats.pointDifferential ?? '0',
        points:      stats.points      ?? '0',
      }
    }).sort((a, b) => a.rank - b.rank)
  }

  const groups = data.children ?? []
  if (groups.length > 0) {
    return groups.map(g => ({ name: g.name, entries: parseEntries(g.standings?.entries) }))
  }
  // Flat standings (no conferences)
  return [{ name: 'Premier League', entries: parseEntries(data.standings?.entries) }]
}

export async function fetchEPLStats() {
  const now    = new Date()
  const season = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  const res    = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/statistics?season=${season}&seasontype=2`
  )
  if (!res.ok) throw new Error(`EPL stats error ${res.status}`)
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
