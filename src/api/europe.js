import { fetchScoreboardMonths } from './espnDates'
import { UEFA_LEAGUE_PHASE, PREMIER_LEAGUE, groupMatchdays, groupByRound } from '../utils/leaguePhase'
import plGameweeks from '../data/plGameweeks.json'

// The UEL and UECL play a whole matchday on one evening, so kickoff order
// says little; their fixtures are listed best-ranked team first instead, as
// are the Premier League's, which spread over Friday to Monday. The UCL is
// spread over two or three days and keeps kickoff order.
//
// `months` is the sweep window as [first, last] month offsets from July of
// the season's first year.
export const EUROPE_COMPETITIONS = [
  { id: 'ucl',  slug: 'uefa.champions',   name: 'Champions League',  short: 'UCL',  accentColor: '#6366f1', sortByRank: false, rules: UEFA_LEAGUE_PHASE, leaguePhase: true },
  { id: 'uel',  slug: 'uefa.europa',      name: 'Europa League',     short: 'UEL',  accentColor: '#f97316', sortByRank: true,  rules: UEFA_LEAGUE_PHASE, leaguePhase: true },
  { id: 'uecl', slug: 'uefa.europa.conf', name: 'Conference League', short: 'UECL', accentColor: '#22c55e', sortByRank: true,  rules: UEFA_LEAGUE_PHASE, leaguePhase: true },
  { id: 'pl',   slug: 'eng.1',            name: 'Premier League',    short: 'PL',   accentColor: '#a855f7', sortByRank: true,  rules: PREMIER_LEAGUE,    leaguePhase: false },
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

// Premier League matches carry their official FPL gameweek, mapped at deploy
// time by scripts/fetch-pl-gameweeks.mjs. A match with no gameweek is a
// postponement awaiting a new date and is left out until it gets one. If the
// map has nothing for this season (say, before the first deploy of a new
// one), rounds fall back to date grouping.
function premierLeagueMatchdays(fixtures) {
  const withRound = fixtures
    .map(f => ({ ...f, round: plGameweeks.gameweeks[f.id] }))
    .filter(f => f.round != null)
  return withRound.length ? groupByRound(withRound) : groupMatchdays(fixtures)
}

const cache = new Map()

// One competition's season as rounds: the league phase for the UEFA
// competitions (September–January; the sweep starts in August to be safe),
// gameweeks for the Premier League (August–May).
export function loadMatchdays(competition) {
  if (!cache.has(competition.id)) {
    const season = getSeason()
    const [from, to] = competition.leaguePhase ? [`${season}0801`, `${season + 1}0131`] : [`${season}0801`, `${season + 1}0531`]
    const promise = fetchScoreboardMonths(`soccer/${competition.slug}`, from, to)
      .then(events => {
        const fixtures = events
          .filter(e => !competition.leaguePhase || e.season?.slug === 'league-phase')
          .map(normalizeFixture)
          .filter(Boolean)
        return competition.leaguePhase ? groupMatchdays(fixtures) : premierLeagueMatchdays(fixtures)
      })
    // Don't pin a failed sweep for the rest of the session.
    promise.catch(() => cache.delete(competition.id))
    cache.set(competition.id, promise)
  }
  return cache.get(competition.id)
}
