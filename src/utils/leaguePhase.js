// League maths for the Europe tab's competitions: grouping fixtures into
// rounds, rebuilding the table as it stood before any round, and tagging each
// fixture by where both sides sit in that table.
//
// Everything is derived from the competition's own fixtures rather than
// ESPN's standings/form fields, so a past round shows the table and form as
// they were going into it, not as they are today.
//
// Each competition carries a rules object (below) for what differs between
// the UEFA league phase and a domestic league: zones, tag thresholds,
// tiebreakers and wording.

const ZONE_STYLES = {
  green: { bar: 'bg-emerald-500', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  blue:  { bar: 'bg-sky-500',     className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  amber: { bar: 'bg-amber-500',   className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  grey:  { bar: 'bg-slate-500',   className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  red:   { bar: 'bg-red-500',     className: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

// Places 1–8 go straight to the Round of 16; 9–16 are seeded and 17–24
// unseeded in the knockout playoff (seeded sides play the second leg at
// home); 25–36 are out. Same cut lines in all three competitions.
export const UEFA_LEAGUE_PHASE = {
  roundName: 'Matchday',
  zones: {
    top:      { label: 'Round of 16',        maxRank: 8,        ...ZONE_STYLES.green },
    seeded:   { label: 'Playoff · seeded',   maxRank: 16,       ...ZONE_STYLES.blue },
    unseeded: { label: 'Playoff · unseeded', maxRank: 24,       ...ZONE_STYLES.amber },
    out:      { label: 'Eliminated',         maxRank: Infinity, ...ZONE_STYLES.red },
  },
  // Tags: both sides at or above topMax, both at or below bottomFrom, both
  // within two places of a cut line, or mismatchGap places apart.
  topMax: 8,
  bottomFrom: 25,
  cutLines: [8, 24],
  mismatchGap: 20,
  tagHints: {
    top:      'Both sides in the top 8',
    bottom:   'Both sides in the elimination zone',
    bubble:   'Both sides within two places of the top-8 or top-24 line',
    mismatch: 'Twenty or more places apart',
  },
  awayGoalsTiebreak: true,
  // Every team has played the same number of games going into a matchday.
  showPlayed: false,
}

// Standard places only: extra European spots from cup winners or UEFA's
// coefficient places change every season.
export const PREMIER_LEAGUE = {
  roundName: 'Gameweek',
  zones: {
    ucl:  { label: 'Champions League',  maxRank: 4,        ...ZONE_STYLES.green },
    uel:  { label: 'Europa League',     maxRank: 5,        ...ZONE_STYLES.blue },
    uecl: { label: 'Conference League', maxRank: 6,        ...ZONE_STYLES.amber },
    mid:  { label: 'Mid-table',         maxRank: 17,       ...ZONE_STYLES.grey },
    drop: { label: 'Relegation',        maxRank: Infinity, ...ZONE_STYLES.red },
  },
  topMax: 6,
  bottomFrom: 15,
  cutLines: [4, 17],
  mismatchGap: 12,
  tagHints: {
    top:      'Both sides in the top 6',
    bottom:   'Both sides in the bottom 6',
    bubble:   'Both sides within two places of the top-4 or relegation line',
    mismatch: 'Twelve or more places apart',
  },
  awayGoalsTiebreak: false,
  // Postponements leave teams with games in hand.
  showPlayed: true,
}

// Eliteserien and Allsvenskan, standard places only, as for the Premier
// League: the champions go to Champions League qualifying, 2nd and 3rd to
// Conference League qualifying, 14th to a relegation playoff against a
// second-tier side (1. divisjon, Superettan).
export const NORDIC_LEAGUE = {
  roundName: 'Gameweek',
  zones: {
    champ:   { label: 'Champions League qualifying',  maxRank: 1,        ...ZONE_STYLES.green },
    uecl:    { label: 'Conference League qualifying', maxRank: 3,        ...ZONE_STYLES.blue },
    mid:     { label: 'Mid-table',                    maxRank: 13,       ...ZONE_STYLES.grey },
    playoff: { label: 'Relegation playoff',           maxRank: 14,       ...ZONE_STYLES.amber },
    drop:    { label: 'Relegation',                   maxRank: Infinity, ...ZONE_STYLES.red },
  },
  topMax: 4,
  bottomFrom: 13,
  cutLines: [3, 13],
  mismatchGap: 9,
  tagHints: {
    top:      'Both sides in the top 4',
    bottom:   'Both sides in the bottom 4',
    bubble:   'Both sides within two places of the European or relegation-playoff line',
    mismatch: 'Nine or more places apart',
  },
  awayGoalsTiebreak: false,
  showPlayed: true,
}

export function zoneFor(rank, rules) {
  return Object.keys(rules.zones).find(id => rank <= rules.zones[id].maxRank)
}

// A league-phase round spans a Tue–Thu window and rounds are at least a week
// apart, so a gap of more than three days always starts a new matchday.
const MATCHDAY_GAP_MS = 3 * 24 * 60 * 60 * 1000

function finishMatchday(number, fixtures) {
  return {
    number,
    fixtures,
    start: fixtures[0].date,
    end:   fixtures[fixtures.length - 1].date,
    done:  fixtures.every(f => f.status === 'final'),
  }
}

export function groupMatchdays(fixtures) {
  const sorted = [...fixtures].sort((a, b) => a.date - b.date)
  const groups = []
  for (const fixture of sorted) {
    const current = groups[groups.length - 1]
    if (current && fixture.date - current[current.length - 1].date <= MATCHDAY_GAP_MS) current.push(fixture)
    else groups.push([fixture])
  }
  return groups.map((group, i) => finishMatchday(i + 1, group))
}

// For fixtures that already know their round (the Premier League's official
// FPL gameweeks), where date gaps would misplace rescheduled matches.
export function groupByRound(fixtures) {
  const byRound = new Map()
  for (const f of [...fixtures].sort((a, b) => a.date - b.date)) {
    if (!byRound.has(f.round)) byRound.set(f.round, [])
    byRound.get(f.round).push(f)
  }
  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, group]) => finishMatchday(round, group))
}

// The matchday worth previewing: the first one still to be completed, or the
// last one once the league phase is over.
export function currentMatchdayIndex(matchdays) {
  const open = matchdays.findIndex(md => !md.done)
  return open === -1 ? matchdays.length - 1 : open
}

// Where to open for someone who has watched up to `watchedThrough`: the
// first matchday they haven't finished, but never past the one being played.
// Looked up by number, since gameweek numbering can skip a round.
export function openingMatchdayIndex(matchdays, watchedThrough) {
  const unwatched = matchdays.findIndex(md => md.number > watchedThrough)
  return Math.min(unwatched === -1 ? matchdays.length - 1 : unwatched, currentMatchdayIndex(matchdays))
}

/**
 * How much of the league phase has been watched, on the same two measures the
 * other leagues use: `watchedPlayed / played` is completion (near 100% when
 * caught up), `watched / total` is the season battery (fills across the year).
 * Only whole matchdays marked watched count — single-game ticks are
 * session-only, and counting them would make the numbers drop on reload.
 */
export function watchCoverage(matchdays, watchedThrough) {
  const fixtures = matchdays.flatMap(md => md.fixtures)
  const watched = matchdays.filter(md => md.number <= watchedThrough).flatMap(md => md.fixtures)
  return {
    total:         fixtures.length,
    played:        fixtures.filter(f => f.status === 'final').length,
    watched:       watched.length,
    watchedPlayed: watched.filter(f => f.status === 'final').length,
  }
}

/**
 * Table and form for every team, using only finished fixtures from matchdays
 * before `beforeMatchday` (1-based). Teams are seeded from every fixture so a
 * side that hasn't played yet still gets a row.
 *
 * Tiebreakers go as far as fixtures allow: points, goal difference, goals
 * scored, then — in UEFA's league phase — away goals scored, wins and away
 * wins. The Premier League's next step is head-to-head, which isn't modelled.
 */
export function buildTable(matchdays, beforeMatchday, rules = UEFA_LEAGUE_PHASE) {
  const rows = new Map()
  const rowFor = team => {
    if (!rows.has(team.id)) {
      rows.set(team.id, { team, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, awayGf: 0, awayWins: 0, points: 0, form: [] })
    }
    return rows.get(team.id)
  }

  for (const md of matchdays) {
    for (const f of md.fixtures) {
      const home = rowFor(f.home)
      const away = rowFor(f.away)
      if (md.number >= beforeMatchday || f.status !== 'final') continue

      home.played++; away.played++
      home.gf += f.homeScore; home.ga += f.awayScore
      away.gf += f.awayScore; away.ga += f.homeScore
      away.awayGf += f.awayScore

      const homeResult = f.homeScore > f.awayScore ? 'W' : f.homeScore < f.awayScore ? 'L' : 'D'
      const awayResult = homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D'
      for (const [row, result, opponent] of [[home, homeResult, f.away], [away, awayResult, f.home]]) {
        if (result === 'W') { row.wins++; row.points += 3 }
        else if (result === 'D') { row.draws++; row.points += 1 }
        else row.losses++
        row.form.push({ result, gameDate: f.date, opponent: opponent.name })
      }
      if (awayResult === 'W') away.awayWins++
    }
  }

  const table = [...rows.values()].sort((a, b) =>
    b.points - a.points ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    b.gf - a.gf ||
    (rules.awayGoalsTiebreak && (
      b.awayGf - a.awayGf ||
      b.wins - a.wins ||
      b.awayWins - a.awayWins
    )) ||
    a.team.name.localeCompare(b.team.name)
  )
  table.forEach((row, i) => { row.rank = i + 1 })
  return new Map(table.map(row => [row.team.id, row]))
}

const TAG_STYLES = {
  top:      { label: 'Top clash',     emoji: '🔥', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  bottom:   { label: 'Bottom scrap',  emoji: '⚠️', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
  bubble:   { label: 'Bubble battle', emoji: '⚖️', className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  mismatch: { label: 'Mismatch',      emoji: '⚡', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
}

// The tags with this competition's hover hints.
export function matchupTags(rules) {
  return Object.fromEntries(Object.entries(TAG_STYLES).map(([id, tag]) => [id, { ...tag, hint: rules.tagHints[id] }]))
}

const nearCut = (rank, cut) => rank > cut - 2 && rank <= cut + 2

/**
 * One tag per fixture, most interesting first. Untagged before anyone has
 * played: on matchday 1 the "table" is just alphabetical.
 */
export function matchupTag(homeRow, awayRow, rules = UEFA_LEAGUE_PHASE) {
  if (!homeRow?.played || !awayRow?.played) return null
  const a = homeRow.rank
  const b = awayRow.rank
  if (a <= rules.topMax && b <= rules.topMax) return 'top'
  if (a >= rules.bottomFrom && b >= rules.bottomFrom) return 'bottom'
  if (rules.cutLines.some(cut => nearCut(a, cut) && nearCut(b, cut))) return 'bubble'
  if (Math.abs(a - b) >= rules.mismatchGap) return 'mismatch'
  return null
}
