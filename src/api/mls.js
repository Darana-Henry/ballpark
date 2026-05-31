const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1'
export const INTER_MIAMI_ID = '20232'

function normalizeEvent(event) {
  const comp = event.competitions?.[0]
  if (!comp) return null

  const home = comp.competitors.find(c => c.homeAway === 'home')
  const away = comp.competitors.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const state = event.status?.type?.state
  const isLive = state === 'in'
  const isFinal = state === 'post'

  const seasonType = event.season?.type ?? 2
  const gameType = seasonType === 3 ? 'MLS Cup Playoffs' : 'Regular Season'

  return {
    id: event.id,
    league: 'mls',
    homeTeam: {
      id: home.team.id,
      name: home.team.displayName,
      abbreviation: home.team.abbreviation,
      logo: home.team.logo ?? null,
    },
    awayTeam: {
      id: away.team.id,
      name: away.team.displayName,
      abbreviation: away.team.abbreviation,
      logo: away.team.logo ?? null,
    },
    homeScore: (isLive || isFinal) ? (parseInt(home.score) || 0) : null,
    awayScore: (isLive || isFinal) ? (parseInt(away.score) || 0) : null,
    status: isLive ? 'live' : isFinal ? 'final' : 'scheduled',
    statusDetail: event.status?.type?.shortDetail ?? '',
    gameDate: new Date(event.date),
    gameType,
    highlightUrl: (isLive || isFinal)
      ? `https://www.espn.com/soccer/match/_/gameId/${event.id}`
      : null,
    venue: comp.venue?.fullName ?? null,
  }
}

async function fetchScoreboardRange(start, end) {
  const res = await fetch(`${BASE}/scoreboard?dates=${start}-${end}&limit=300`)
  if (!res.ok) return []
  const data = await res.json()
  return data.events ?? []
}

export async function fetchMLSGames() {
  const year = new Date().getFullYear()
  // MLS season runs Feb–Nov; fetch in two big chunks to minimise requests
  const chunks = [
    [`${year}0201`, `${year}0630`],
    [`${year}0701`, `${year}1130`],
  ]

  const results = await Promise.allSettled(
    chunks.map(([s, e]) => fetchScoreboardRange(s, e))
  )

  const seen = new Set()
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(event => {
      if (seen.has(event.id)) return false
      seen.add(event.id)
      const comp = event.competitions?.[0]
      return comp?.competitors?.some(c => c.team?.id === INTER_MIAMI_ID)
    })
    .map(normalizeEvent)
    .filter(Boolean)
}

export async function fetchMLSStats() {
  const year = new Date().getFullYear()
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/statistics?season=${year}&seasontype=2`
  )
  if (!res.ok) throw new Error(`MLS stats error ${res.status}`)
  const data = await res.json()

  return (data.stats ?? []).map(cat => ({
    name: cat.name,
    displayName: cat.displayName,
    leaders: (cat.leaders ?? []).slice(0, 10).map(l => {
      const matchesMatch = (l.displayValue ?? '').match(/Matches?:\s*(\d+)/i)
      return {
        value: Math.round(l.value),
        matches: matchesMatch ? parseInt(matchesMatch[1]) : null,
        athlete: {
          id: l.athlete?.id,
          name: l.athlete?.displayName,
          shortName: l.athlete?.shortName,
          photo: l.athlete?.headshot?.href ?? null,
        },
      }
    }),
  }))
}

export async function fetchMLSStandings() {
  const res = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/usa.1/standings')
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
        teamId: e.team?.id,
        teamName: e.team?.displayName,
        abbreviation: e.team?.abbreviation,
        logo,
        rank: parseInt(stats.rank) || 99,
        gamesPlayed: stats.gamesPlayed ?? '0',
        wins: stats.wins ?? '0',
        draws: stats.ties ?? '0',
        losses: stats.losses ?? '0',
        gf: stats.pointsFor ?? '0',
        ga: stats.pointsAgainst ?? '0',
        gd: stats.pointDifferential ?? '0',
        points: stats.points ?? '0',
        overall: stats.overall ?? '',
      }
    }).sort((a, b) => a.rank - b.rank),
  }))
}
