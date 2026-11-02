// Where a match stands going into it, from the user's point of view: the
// series score (or each side's record) counting only the *other* games they've
// seen. Shown in the boundary tracker so they know what's riding on the match
// without anything unwatched being given away.
//
// `isSeen(match)` is true for a match watched in full, or one that was never
// played (see isNotPlayed). A seen match with no winner (no result, tie,
// abandoned) counts as seen but adds no win.

// The winning side's name, from the flags the Wikipedia data carries or, for
// BBL (CricAPI), from the result text: "Sydney Sixers won by 6 wickets".
export function matchWinner(game) {
  if (game.homeWon) return game.homeTeam.name
  if (game.awayWon) return game.awayTeam.name
  const m = (game.statusDetail || '').match(/^(.+?)\s+won\b/i)
  if (!m) return null
  const name = m[1].trim().toLowerCase()
  for (const team of [game.homeTeam, game.awayTeam]) {
    if (team.name.toLowerCase() === name || team.name.toLowerCase().startsWith(name) || name.startsWith(team.name.toLowerCase())) return team.name
  }
  return null
}

const FORMAT_WORD = { odi: 'ODI', t20i: 'T20I', test: 'Test' }

function teamRecords(game, others, isSeen) {
  const names = [game.homeTeam.name, game.awayTeam.name]
  const rec = Object.fromEntries(names.map(n => [n, { name: n, w: 0, l: 0, nr: 0 }]))
  let seen = 0
  for (const m of others) {
    if (m.status !== 'final' || !isSeen(m)) continue
    const sides = [m.homeTeam.name, m.awayTeam.name]
    if (!sides.some(n => rec[n])) continue
    seen++
    const winner = matchWinner(m)
    for (const n of sides) {
      if (!rec[n]) continue
      if (!winner) rec[n].nr++
      else if (winner === n) rec[n].w++
      else rec[n].l++
    }
  }
  return { teams: names.map(n => rec[n]), seen }
}

/**
 * - `{ kind: 'series', number, total, format, wins: { [team]: n }, seen,
 *    unseen, leader, margin }` for a bilateral series (one format at a time:
 *    a tour's T20Is are their own series)
 * - `{ kind: 'records', label, teams: [{ name, w, l, nr }], seen }` for a
 *    tri-series, a tournament, or the BBL: each side's record in it
 */
export function seriesStatus(game, games, isSeen) {
  if (game.league === 'bbl') {
    const others = games.filter(g => g.league === 'bbl' && g.id !== game.id)
    return { kind: 'records', label: 'this BBL season', ...teamRecords(game, others, isSeen) }
  }

  const sameEvent = games.filter(g =>
    g.seriesLabel && g.seriesLabel === game.seriesLabel && g.matchType === game.matchType && !g.testMatchId)
  const others = sameEvent.filter(g => g.id !== game.id)

  if (game.seriesKind && game.seriesKind !== 'bilateral') {
    return { kind: 'records', label: 'this tournament', ...teamRecords(game, others, isSeen) }
  }

  const ordered = [...sameEvent].sort((a, b) => a.gameDate - b.gameDate)
  const number = ordered.findIndex(g => g.id === game.id) + 1
  const wins = { [game.homeTeam.name]: 0, [game.awayTeam.name]: 0 }
  let seen = 0
  for (const m of others) {
    if (m.status !== 'final' || !isSeen(m)) continue
    seen++
    const winner = matchWinner(m)
    if (winner && winner in wins) wins[winner]++
  }
  const [a, b] = Object.entries(wins).sort((x, y) => y[1] - x[1])
  return {
    kind: 'series',
    number: number || null,
    total: ordered.length,
    format: FORMAT_WORD[game.matchType] ?? '',
    wins,
    seen,
    unseen: others.filter(m => m.status === 'final' && !isSeen(m)).length,
    leader: a[1] > b[1] ? a[0] : null,
    margin: `${a[1]}–${b[1]}`,
  }
}

// ─── Home / away form ──────────────────────────────────────────────────────────
// A side at home and the same side away are different propositions in
// cricket, so each team's form is its last five games *in that venue role* in
// the same format: the home side's last five at home, the away side's last
// five away (neutral venues count as away for both).
//
// The data has no venue country, so the host comes from the series name:
// "India tour of New Zealand" → New Zealand, "Afghanistan v Zimbabwe (in
// UAE)" → UAE (neutral for both), "Pakistan ODI Tri-Series" → Pakistan. A
// tournament that names no nation ("ICC Men's T20 World Cup") has no known
// host, and its games are left out.

export function seriesHost(game) {
  const label = game.seriesLabel || ''
  const tour = label.match(/tour of (.+?)(?:,|$)/i)
  if (tour) return tour[1].trim()
  const neutral = label.match(/\(in ([^)]+)\)/i)
  if (neutral) return neutral[1].trim()
  const teams = game.seriesTeams ?? [game.homeTeam.name, game.awayTeam.name]
  return teams.find(t => label.includes(t)) ?? null
}

// 'home' | 'away' | null (host unknown) for one side of a game.
export function venueRole(game, team) {
  if (game.league === 'bbl') return null
  const host = seriesHost(game)
  if (!host) return null
  return host === team ? 'home' : 'away'
}

/**
 * The team's last five games before this one in the same format and venue
 * role (or, for the BBL, its last five games), oldest first. Each is
 * `{ id, date, opponent, result }`, `result` being 'W' | 'L' | 'NR' for a game
 * seen, null for one played but not watched yet (shown without its result).
 */
export function recentForm(game, team, games, isSeen, limit = 5) {
  const role = venueRole(game, team)
  if (game.league !== 'bbl' && !role) return { role: null, games: [] }
  const past = games
    .filter(g => g.id !== game.id && !g.testMatchId && g.status === 'final' && g.gameDate < game.gameDate)
    .filter(g => g.league === game.league && (game.league === 'bbl' || g.matchType === game.matchType))
    .filter(g => g.homeTeam.name === team || g.awayTeam.name === team)
    .filter(g => game.league === 'bbl' || venueRole(g, team) === role)
    .sort((a, b) => a.gameDate - b.gameDate)
    .slice(-limit)
  return {
    role,
    games: past.map(g => {
      const opponent = g.homeTeam.name === team ? g.awayTeam : g.homeTeam
      if (!isSeen(g)) return { id: g.id, date: g.gameDate, opponent, result: null }
      const winner = matchWinner(g)
      return { id: g.id, date: g.gameDate, opponent, result: !winner ? 'NR' : winner === team ? 'W' : 'L' }
    }),
  }
}
