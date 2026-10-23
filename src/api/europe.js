import { fetchScoreboardMonths } from './espnDates'

// The UEL and UECL play a whole matchday on one evening, so kickoff order
// says little; their fixtures are listed best-ranked team first instead.
// The UCL is spread over two or three days and keeps kickoff order.
export const EUROPE_COMPETITIONS = [
  { id: 'ucl',  slug: 'uefa.champions',   name: 'Champions League',  short: 'UCL',  accentColor: '#6366f1', sortByRank: false },
  { id: 'uel',  slug: 'uefa.europa',      name: 'Europa League',     short: 'UEL',  accentColor: '#f97316', sortByRank: true  },
  { id: 'uecl', slug: 'uefa.europa.conf', name: 'Conference League', short: 'UECL', accentColor: '#22c55e', sortByRank: true  },
]

// European seasons start in July (qualifiers); season 2026 = 2026-27.
export function getSeason() {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

function normalizeTeam(competitor) {
  return {
    id:           competitor.team.id,
    name:         competitor.team.displayName,
    shortName:    competitor.team.shortDisplayName ?? competitor.team.displayName,
    abbreviation: competitor.team.abbreviation,
    logo:         competitor.team.logo ?? null,
  }
}

function normalizeFixture(event) {
  const comp = event.competitions?.[0]
  const home = comp?.competitors?.find(c => c.homeAway === 'home')
  const away = comp?.competitors?.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const state = event.status?.type?.state
  const isFinal = state === 'post'
  return {
    id:           event.id,
    date:         new Date(event.date),
    home:         normalizeTeam(home),
    away:         normalizeTeam(away),
    homeScore:    isFinal ? parseInt(home.score) || 0 : null,
    awayScore:    isFinal ? parseInt(away.score) || 0 : null,
    status:       state === 'in' ? 'live' : isFinal ? 'final' : 'scheduled',
    statusDetail: event.status?.type?.shortDetail ?? '',
  }
}

const cache = new Map()

// Every league-phase fixture for one competition this season. The league
// phase runs September–January; the sweep starts in August to be safe.
export function fetchLeaguePhaseFixtures(slug) {
  if (!cache.has(slug)) {
    const season = getSeason()
    const promise = fetchScoreboardMonths(`soccer/${slug}`, `${season}0801`, `${season + 1}0131`)
      .then(events => events
        .filter(e => e.season?.slug === 'league-phase')
        .map(normalizeFixture)
        .filter(Boolean))
    // Don't pin a failed sweep for the rest of the session.
    promise.catch(() => cache.delete(slug))
    cache.set(slug, promise)
  }
  return cache.get(slug)
}
