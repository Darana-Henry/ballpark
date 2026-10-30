// Transfer and chip suggestions for the user's squad, built on the same
// projection as the My team pitch (fantasyLineup.js): form × fixture ×
// chance of playing, per round.
//
// A squad is scored over the planning horizon as the sum, round by round, of
// its best XI plus the captain counted twice, so a bench upgrade is worth
// little and a starter upgrade a lot, as in the game.

import { upcomingFixtures } from './fantasyFixtures'
import { projectPoints, pickLineup } from './fantasyLineup'

const sum = values => values.reduce((total, v) => total + v, 0)

/** Every player's projected points per round, from `fromRound` for `count` rounds. */
export function projectRounds(players, fixtures, teams, fromRound, count) {
  const { rounds, byTeam } = upcomingFixtures(fixtures, teams, fromRound, count)
  const byPlayer = new Map(players.map(p => {
    const games = rounds.map((_, i) => byTeam.get(p.team)?.[i] ?? [])
    const perRound = games.map(g => projectPoints(p, g).points)
    return [p.id, { perRound, games }]
  }))
  return { rounds, byPlayer }
}

function lineupIn(squad, projected, i) {
  return pickLineup(squad.map(p => ({ ...p, projection: { points: projected.get(p.id).perRound[i] } })))
}

const byDesc = (a, b) => b - a

// Best XI plus captain, over the first `horizon` rounds. The same pick as
// pickLineup (each position's minimum, then the best of the rest up to its
// maximum), on bare numbers: the planner scores thousands of squads.
function squadScore(squad, projected, horizon) {
  let total = 0
  for (let i = 0; i < horizon; i++) {
    const pts = { 1: [], 2: [], 3: [], 4: [] }
    for (const p of squad) pts[p.position].push(projected.get(p.id).perRound[i])
    for (const list of Object.values(pts)) list.sort(byDesc)
    const starters = [...pts[1].slice(0, 1), ...pts[2].slice(0, 3), ...pts[3].slice(0, 2), ...pts[4].slice(0, 1)]
    const rest = [...pts[2].slice(3, 5), ...pts[3].slice(2, 5), ...pts[4].slice(1, 3)].sort(byDesc).slice(0, 11 - starters.length)
    total += sum(starters) + sum(rest) + Math.max(0, ...starters, ...rest)
  }
  return total
}

// The game keeps half of a price rise when selling (rounded down to £0.1m),
// and passes a fall on in full.
export function sellPrice(player, sellOnFee) {
  const rise = Math.round((player.price - player.purchasePrice) * 10)
  return rise <= 0 ? player.price : player.purchasePrice + Math.floor(rise * sellOnFee) / 10
}

/**
 * Greedy transfer plan: each step makes the single swap that adds the most to
 * the squad's score, within budget and the per-club limit, until `maxMoves`
 * or nothing helps. Plans for fewer transfers are the first moves of this
 * one. Each move keeps the top 5 replacements for the player going out, and
 * `singles` the top 5 one-transfer swaps overall.
 *
 * `squad` items need `purchasePrice`; `pool` is the candidates to buy.
 */
export function planTransfers({ squad, pool, bank, projected, horizon, teamLimit, sellOnFee, maxMoves }) {
  let current = [...squad]
  let money = bank
  let score = squadScore(current, projected, horizon)
  const start = score
  const moves = []
  let singles = []
  const byPosition = pos => pool.filter(p => p.position === pos)

  for (let step = 0; step < maxMoves; step++) {
    const owned = new Set(current.map(p => p.id))
    const perClub = new Map()
    for (const p of current) perClub.set(p.team, (perClub.get(p.team) ?? 0) + 1)
    let best = null
    const all = []
    for (const out of current) {
      const budget = money + sellPrice(out, sellOnFee)
      const options = []
      for (const cand of byPosition(out.position)) {
        if (owned.has(cand.id) || cand.price > budget + 1e-9) continue
        if (cand.team !== out.team && (perClub.get(cand.team) ?? 0) >= teamLimit) continue
        const next = current.map(p => (p === out ? { ...cand, purchasePrice: cand.price } : p))
        options.push({ out, in: cand, gain: squadScore(next, projected, horizon) - score })
      }
      options.sort((a, b) => b.gain - a.gain)
      all.push(...options.slice(0, 5))
      if (options[0] && (!best || options[0].gain > best.gain)) best = { ...options[0], options: options.slice(0, 5) }
    }
    if (step === 0) singles = all.sort((a, b) => b.gain - a.gain).slice(0, 5)
    if (!best || best.gain < 0.05) break
    moves.push({ ...best, bankAfter: money + sellPrice(best.out, sellOnFee) - best.in.price })
    money = moves.at(-1).bankAfter
    current = current.map(p => (p === best.out ? { ...best.in, purchasePrice: best.in.price } : p))
    score += best.gain
  }
  return { moves, singles, gain: score - start }
}

// Chip names in the game's feed → what the game calls them.
export const CHIP_NAMES = {
  wildcard: 'Wildcard',
  frush: 'Attack Attack',
  pdbus: 'Park the Bus',
  rich: 'Rich Uncle',
  '2capt': 'Two Captains',
  freehit: 'Free Hit',
}

// What each team chip adds in one round for the squad as it stands, in
// projected points. Attack Attack doubles the forwards, Park the Bus the
// defenders, Two Captains a second captain; Rich Uncle is a one-round squad
// on an unlimited budget, measured against the current XI.
export function chipValueInRound(name, squad, projected, i, pool, teamLimit) {
  const { starters } = lineupIn(squad, projected, i)
  const points = p => p.projection.points
  if (name === 'frush') return sum(starters.filter(p => p.position === 4).map(points))
  if (name === 'pdbus') return sum(starters.filter(p => p.position === 2).map(points))
  if (name === '2capt') return starters[1] ? points(starters[1]) : 0
  if (name === 'rich' || name === 'freehit') {
    const current = sum(starters.map(points)) + (starters[0] ? points(starters[0]) : 0)
    return dreamScore(pool, projected, i, teamLimit) - current
  }
  return null
}

// The best squad money can't buy: top projected players at each position,
// at most `teamLimit` per club, best XI plus captain.
function dreamScore(pool, projected, i, teamLimit) {
  const ranked = [...pool].sort((a, b) => projected.get(b.id).perRound[i] - projected.get(a.id).perRound[i])
  const quota = { 1: 2, 2: 5, 3: 5, 4: 3 }
  const perClub = new Map()
  const squad = []
  for (const p of ranked) {
    if (!quota[p.position] || (perClub.get(p.team) ?? 0) >= teamLimit) continue
    quota[p.position]--
    perClub.set(p.team, (perClub.get(p.team) ?? 0) + 1)
    squad.push(p)
  }
  const { starters, captain } = lineupIn(squad, projected, i)
  return sum(starters.map(p => p.projection.points)) + (captain?.projection.points ?? 0)
}
