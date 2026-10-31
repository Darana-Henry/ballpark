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

export function withForm(player) {
  return {
    ...player,
    total: sumLast(player.points, player.points.length),
    last7: sumLast(player.points, 7),
    last4: sumLast(player.points, 4),
    minutesTotal: sumLast(player.minutes, player.minutes.length),
    minutes7: sumLast(player.minutes, 7),
    minutes4: sumLast(player.minutes, 4),
  }
}
