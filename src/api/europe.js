import { fetchScoreboardMonths } from './espnDates'
import { UEFA_LEAGUE_PHASE, PREMIER_LEAGUE, ELITESERIEN, groupMatchdays, groupByRound } from '../utils/leaguePhase'
import plGameweeks from '../data/plGameweeks.json'
import eliteserienRounds from '../data/eliteserienRounds.json'

// The UEL and UECL play a whole matchday on one evening, so kickoff order
// says little; their fixtures are listed best-ranked team first instead, as
// are the Premier League's, which spread over Friday to Monday. The UCL is
// spread over two or three days and keeps kickoff order.
//
// Domestic leagues carry `roundOf`, their ESPN match id → official fantasy
// round map. Eliteserien runs March–December inside one calendar year
// (`calendarYear`), and is `spoilerFree`: it's followed for fantasy rather
// than watched, so the table and scores are never hidden.
export const EUROPE_COMPETITIONS = [
  { id: 'ucl',  slug: 'uefa.champions',   name: 'Champions League',  short: 'UCL',  accentColor: '#6366f1', sortByRank: false, rules: UEFA_LEAGUE_PHASE, leaguePhase: true },
  { id: 'uel',  slug: 'uefa.europa',      name: 'Europa League',     short: 'UEL',  accentColor: '#f97316', sortByRank: true,  rules: UEFA_LEAGUE_PHASE, leaguePhase: true },
  { id: 'uecl', slug: 'uefa.europa.conf', name: 'Conference League', short: 'UECL', accentColor: '#22c55e', sortByRank: true,  rules: UEFA_LEAGUE_PHASE, leaguePhase: true },
  { id: 'pl',   slug: 'eng.1',            name: 'Premier League',    short: 'PL',   accentColor: '#a855f7', sortByRank: true,  rules: PREMIER_LEAGUE,    leaguePhase: false, roundOf: plGameweeks.gameweeks },
  { id: 'eli',  slug: 'nor.1',            name: 'Eliteserien',       short: 'ELI',  accentColor: '#ef4444', sortByRank: true,  rules: ELITESERIEN,       leaguePhase: false, roundOf: eliteserienRounds.rounds, calendarYear: true, spoilerFree: true },
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

// Domestic league matches carry their official fantasy round, mapped at
// deploy time (scripts/fetch-pl-gameweeks.mjs, scripts/fetch-eliteserien-players.mjs).
// A match with no round is a postponement awaiting a new date and is left
// out until it gets one. If the map has nothing for this season (say, before
// the first deploy of a new one), rounds fall back to date grouping.
function leagueMatchdays(fixtures, roundOf) {
  const withRound = fixtures
    .map(f => ({ ...f, round: roundOf[f.id] }))
    .filter(f => f.round != null)
  return withRound.length ? groupByRound(withRound) : groupMatchdays(fixtures)
}

const cache = new Map()

// One competition's season as rounds: the league phase for the UEFA
// competitions (September–January; the sweep starts in August to be safe),
// gameweeks for the Premier League (August–May) and Eliteserien (March–December).
export function loadMatchdays(competition) {
  if (!cache.has(competition.id)) {
    const season = getSeason()
    const year = new Date().getFullYear()
    const [from, to] = competition.calendarYear ? [`${year}0301`, `${year}1231`]
      : competition.leaguePhase ? [`${season}0801`, `${season + 1}0131`]
      : [`${season}0801`, `${season + 1}0531`]
    const promise = fetchScoreboardMonths(`soccer/${competition.slug}`, from, to)
      .then(events => {
        const fixtures = events
          .filter(e => !competition.leaguePhase || e.season?.slug === 'league-phase')
          .map(normalizeFixture)
          .filter(Boolean)
        return competition.leaguePhase ? groupMatchdays(fixtures) : leagueMatchdays(fixtures, competition.roundOf)
      })
    // Don't pin a failed sweep for the rest of the session.
    promise.catch(() => cache.delete(competition.id))
    cache.set(competition.id, promise)
  }
  return cache.get(competition.id)
}
