import { pooledMap } from '../utils/pool'

const SITE = 'https://site.api.espn.com/apis'
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'

// NFL schedules are announced ~mid-May for the season kicking off that
// September — months before games start — so switch over as soon as the new
// season's data would plausibly exist, not once games begin.
export function getNFLSeason() {
  const now = new Date()
  return now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1
}

async function getJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN API error ${res.status}`)
  return res.json()
}

const statValue = (stats, name) => stats?.find(s => s.name === name)?.value ?? 0

// ─── League-wide team ranking ────────────────────────────────────────────────

/**
 * All 32 teams ranked across the whole league by win percentage — the measure
 * NFL seeding uses, and one ESPN already computes with ties counted as half a
 * win.
 *
 * Teams on the same win percentage share a rank and the following rank skips
 * (standard competition ranking), so an early-season table reads "six teams at
 * [1]" rather than inventing an order between identical 1-0 records. Wins and
 * losses only order the display list, never the rank itself.
 */
export async function fetchNFLTeamRanks() {
  const season = getNFLSeason()
  const data = await getJSON(`${SITE}/v2/sports/football/nfl/standings?season=${season}`)

  const teams = (data.children ?? []).flatMap(conf =>
    (conf.standings?.entries ?? []).map(entry => ({
      teamId:       entry.team?.id,
      abbreviation: entry.team?.abbreviation,
      name:         entry.team?.displayName,
      wins:         Math.round(statValue(entry.stats, 'wins')),
      losses:       Math.round(statValue(entry.stats, 'losses')),
      ties:         Math.round(statValue(entry.stats, 'ties')),
      winPercent:   statValue(entry.stats, 'winPercent'),
    }))
  )

  teams.sort((a, b) =>
    b.winPercent - a.winPercent || b.wins - a.wins || a.losses - b.losses
  )

  const rankByTeamId = {}
  let rank = 0
  teams.forEach((team, i) => {
    if (i === 0 || teams[i - 1].winPercent !== team.winPercent) rank = i + 1
    team.rank = rank
    rankByTeamId[team.teamId] = rank
  })

  return { season, teams, rankByTeamId }
}

// ─── Athlete lookup ──────────────────────────────────────────────────────────

// Athlete names and headshots don't change, so resolved records are cached
// indefinitely by id — the leaderboards and the quarterback grid both need
// dozens of them and would otherwise re-fetch on every visit.
const ATHLETE_CACHE_KEY = 'ballpark_nfl_athletes_v1'
const readAthleteCache  = () => { try { return JSON.parse(localStorage.getItem(ATHLETE_CACHE_KEY) || '{}') } catch { return {} } }
const writeAthleteCache = c => { try { localStorage.setItem(ATHLETE_CACHE_KEY, JSON.stringify(c)) } catch { /* quota or private mode */ } }

const idFromRef = ref => ref?.match(/\/(?:athletes|teams)\/(\d+)/)?.[1] ?? null

async function resolveAthletes(refs) {
  const unique = [...new Set(refs.filter(Boolean))]
  const cache = readAthleteCache()
  const missing = unique.filter(ref => !cache[idFromRef(ref)])

  const fetched = await pooledMap(missing, async ref => {
    const a = await getJSON(ref)
    return {
      id:       a.id,
      name:     a.displayName,
      position: a.position?.abbreviation ?? null,
      photo:    a.headshot?.href ?? null,
    }
  })

  let changed = false
  fetched.forEach(a => {
    if (!a?.id) return
    cache[a.id] = a
    changed = true
  })
  if (changed) writeAthleteCache(cache)

  return cache
}

// ─── Current starting quarterbacks ───────────────────────────────────────────

// The starter is the rank-1 quarterback on the team's offensive depth chart.
// ESPN publishes several formation charts per team; any of them that lists a
// quarterback agrees on the ordering, so the first one that does is used.
function starterRefFromDepthCharts(items) {
  for (const chart of items ?? []) {
    const entries = chart.positions?.qb?.athletes ?? []
    const starter = entries.find(a => a.rank === 1) ?? entries[0]
    if (starter?.athlete?.$ref) return starter.athlete.$ref
  }
  return null
}

/**
 * Current starting quarterback per team, keyed by team abbreviation.
 * Read live rather than stored, so a mid-season change shows up on the next
 * load without the static history file being touched.
 */
export async function fetchCurrentStartingQBs(teams) {
  const season = getNFLSeason()

  const refs = await pooledMap(teams, async team => {
    const data = await getJSON(`${CORE}/seasons/${season}/teams/${team.teamId}/depthcharts`)
    return { abbr: team.abbreviation, ref: starterRefFromDepthCharts(data.items) }
  })

  const athletes = await resolveAthletes(refs.map(r => r?.ref))

  const byTeam = {}
  refs.forEach(r => {
    if (!r?.abbr) return
    const athlete = athletes[idFromRef(r.ref)]
    if (athlete) byTeam[r.abbr] = athlete
  })
  return { season, byTeam }
}
