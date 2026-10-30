// Start/bench and captaincy suggestions for the user's squad in one round.
//
// A player's projection is deliberately simple, so the reason for each pick
// can be read off the card:
//   form     points per round, 60% over the last 4 rounds and 40% over the
//            last 7 (rounds without minutes count as 0, which prices in
//            rotation; a negative run, say a keeper shipping goals, floors at 0)
//   fixture  scaled by the opponent's difficulty rating (fantasyFixtures.js),
//            summed over a double round, 0 in a blank one
//   fitness  scaled by the game's chance of playing; 0 when injured,
//            suspended or gone

const FIXTURE_FACTOR = { 1: 1.25, 2: 1.12, 3: 1, 4: 0.88, 5: 0.76 }

// The game's formation limits: 1 keeper and 3–5 / 2–5 / 1–3 outfielders.
const LIMITS = { 1: [1, 1], 2: [3, 5], 3: [2, 5], 4: [1, 3] }

const OUT = new Set(['injured', 'suspended', 'unavailable'])

export function projectPoints(player, games) {
  const form = Math.max(0, 0.6 * (player.last4 / 4) + 0.4 * (player.last7 / 7))
  const fixture = games.reduce((sum, g) => sum + FIXTURE_FACTOR[g.difficulty], 0)
  const fitness = OUT.has(player.availability) ? 0 : (player.chance ?? 100) / 100
  return { form, fixture, fitness, points: form * fixture * fitness }
}

/**
 * Best XI from a 15-man squad, by projection: the best keeper, the minimum
 * of each outfield position, then the best of the rest up to each maximum.
 * Taking the minimums first and filling greedily always finds the top total.
 * `squad` items need `position` and `projection.points`.
 */
export function pickLineup(squad) {
  const best = list => [...list].sort((a, b) => b.projection.points - a.projection.points)
  const byPosition = pos => best(squad.filter(p => p.position === pos))
  const starters = new Set()
  for (const [pos, [min]] of Object.entries(LIMITS)) byPosition(Number(pos)).slice(0, min).forEach(p => starters.add(p))
  const count = pos => [...starters].filter(p => p.position === pos).length
  for (const p of best(squad)) {
    if (starters.size === 11) break
    if (!starters.has(p) && count(p.position) < LIMITS[p.position][1]) starters.add(p)
  }
  const xi = best([...starters])
  // The game's bench: the spare keeper in the first slot, then outfielders by projection.
  const rest = squad.filter(p => !starters.has(p))
  const bench = [...rest.filter(p => p.position === 1), ...best(rest.filter(p => p.position !== 1))]
  return {
    starters: xi,
    bench,
    captain: xi[0] ?? null,
    vice: xi[1] ?? null,
    formation: [2, 3, 4].map(count).join('-'),
  }
}
