// League-phase maths for the UEFA competitions: grouping fixtures into
// matchdays, rebuilding the 36-team table as it stood before any matchday,
// and tagging each fixture by where both sides sit in that table.
//
// Everything is derived from the competition's own fixtures rather than
// ESPN's standings/form fields, so a past matchday shows the table and form
// as they were going into it, not as they are today.

// Places 1–8 go straight to the Round of 16; 9–16 are seeded and 17–24
// unseeded in the knockout playoff (seeded sides play the second leg at
// home); 25–36 are out. Same cut lines in all three competitions.
export const ZONES = {
  top:      { label: 'Round of 16',        maxRank: 8,        bar: 'bg-emerald-500', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  seeded:   { label: 'Playoff · seeded',   maxRank: 16,       bar: 'bg-sky-500',     className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  unseeded: { label: 'Playoff · unseeded', maxRank: 24,       bar: 'bg-amber-500',   className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  out:      { label: 'Eliminated',         maxRank: Infinity, bar: 'bg-red-500',     className: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

const PLAYOFF_CUT = ZONES.unseeded.maxRank

export function zoneFor(rank) {
  return Object.keys(ZONES).find(id => rank <= ZONES[id].maxRank)
}

// A league-phase round spans a Tue–Thu window and rounds are at least a week
// apart, so a gap of more than three days always starts a new matchday.
const MATCHDAY_GAP_MS = 3 * 24 * 60 * 60 * 1000

export function groupMatchdays(fixtures) {
  const sorted = [...fixtures].sort((a, b) => a.date - b.date)
  const matchdays = []
  for (const fixture of sorted) {
    const current = matchdays[matchdays.length - 1]
    if (current && fixture.date - current.fixtures[current.fixtures.length - 1].date <= MATCHDAY_GAP_MS) {
      current.fixtures.push(fixture)
    } else {
      matchdays.push({ number: matchdays.length + 1, fixtures: [fixture] })
    }
  }
  return matchdays.map(md => ({
    ...md,
    start: md.fixtures[0].date,
    end:   md.fixtures[md.fixtures.length - 1].date,
    done:  md.fixtures.every(f => f.status === 'final'),
  }))
}

// The matchday worth previewing: the first one still to be completed, or the
// last one once the league phase is over.
export function currentMatchdayIndex(matchdays) {
  const open = matchdays.findIndex(md => !md.done)
  return open === -1 ? matchdays.length - 1 : open
}

// Where to open for someone who has watched up to `watchedThrough`: the
// first matchday they haven't finished, but never past the one being played.
export function openingMatchdayIndex(matchdays, watchedThrough) {
  return Math.min(watchedThrough, currentMatchdayIndex(matchdays), matchdays.length - 1)
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
 * Tiebreakers follow UEFA's league-phase order as far as fixtures allow:
 * points, goal difference, goals scored, away goals scored, wins, away wins.
 */
export function buildTable(matchdays, beforeMatchday) {
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
    b.awayGf - a.awayGf ||
    b.wins - a.wins ||
    b.awayWins - a.awayWins ||
    a.team.name.localeCompare(b.team.name)
  )
  table.forEach((row, i) => { row.rank = i + 1 })
  return new Map(table.map(row => [row.team.id, row]))
}

export const MATCHUP_TAGS = {
  top:      { label: 'Top clash',     emoji: '🔥', className: 'bg-orange-500/15 text-orange-300 border-orange-500/30', hint: 'Both sides in the top 8' },
  bottom:   { label: 'Bottom scrap',  emoji: '⚠️', className: 'bg-red-500/15 text-red-300 border-red-500/30',          hint: 'Both sides in the elimination zone' },
  bubble:   { label: 'Bubble battle', emoji: '⚖️', className: 'bg-violet-500/15 text-violet-300 border-violet-500/30', hint: 'Both sides within two places of the same cut line' },
  mismatch: { label: 'Mismatch',      emoji: '⚡', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30',    hint: 'Twenty or more places apart' },
}

const CUT_LINES = [ZONES.top.maxRank, PLAYOFF_CUT]
const nearCut = (rank, cut) => rank > cut - 2 && rank <= cut + 2

/**
 * One tag per fixture, most interesting first. Untagged before anyone has
 * played: on matchday 1 the "table" is just alphabetical.
 */
export function matchupTag(homeRow, awayRow) {
  if (!homeRow?.played || !awayRow?.played) return null
  const a = homeRow.rank
  const b = awayRow.rank
  if (a <= ZONES.top.maxRank && b <= ZONES.top.maxRank) return 'top'
  if (a > PLAYOFF_CUT && b > PLAYOFF_CUT) return 'bottom'
  if (CUT_LINES.some(cut => nearCut(a, cut) && nearCut(b, cut))) return 'bubble'
  if (Math.abs(a - b) >= 20) return 'mismatch'
  return null
}
