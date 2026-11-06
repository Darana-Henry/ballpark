// Per-player form numbers for fantasy player tables, from the per-round
// points and minutes in src/data/<league>Players.json.

export const POSITIONS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' }

const OFFICIAL_STATUS = { a: 'available', d: 'doubtful', i: 'injured', s: 'suspended', u: 'unavailable', n: 'unavailable' }

// The official fantasy status wins; Transfermarkt fills in absences the game
// hasn't flagged yet (often red-card bans). Unavailable usually means the
// player has left the league.
export function availability(p) {
  const official = OFFICIAL_STATUS[p.status] ?? 'available'
  if (official !== 'available' || !p.absence) return official
  if (p.absence.type === 'injury') return 'injured'
  return /suspension/i.test(p.absence.reason) ? 'suspended' : 'unavailable'
}

// Rounds a player wasn't in the game yet are null and count as 0.
function sumLast(values, n) {
  return values.slice(-n).reduce((sum, v) => sum + (v ?? 0), 0)
}

// A Bundesliga player the app export hasn't read in detail yet has no
// matchdays (all null), only the app's season total and average: those
// stand in until the next import fills them.
export function withForm(player) {
  const unread = player.avgPoints != null && player.points.every(v => v == null)
  // The app's average is per game played, which flatters a player with few
  // games; the season total spread over every matchday so far isn't fooled.
  const rounds = player.points.length
  const recent = n => (unread ? (rounds ? ((player.totalPoints ?? 0) * Math.min(n, rounds)) / rounds : 0) : sumLast(player.points, n))
  return {
    ...player,
    total: unread ? player.totalPoints ?? 0 : sumLast(player.points, player.points.length),
    last7: recent(7),
    last4: recent(4),
    minutesTotal: sumLast(player.minutes, player.minutes.length),
    minutes7: sumLast(player.minutes, 7),
    minutes4: sumLast(player.minutes, 4),
  }
}
