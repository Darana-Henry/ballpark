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

// Chips in the game's feeds → what the games call them and, as fan guides
// describe them, what they do (the feeds don't say). `uteam` is
// Allsvenskan's; its name and effect aren't confirmed anywhere, but the game
// marks it a transfer chip from round 2, like Eliteserien's rich uncle.
export const CHIPS = {
  wildcard: { label: 'Wildcard' },
  frush: { label: 'Attack Attack', effect: 'doubles your forwards' },
  pdbus: { label: 'Park the Bus', effect: 'doubles your defenders' },
  '2capt': { label: 'Two Captains', effect: 'doubles a second player' },
  rich: { label: 'Rich Uncle', effect: 'is a one-round squad on an unlimited budget' },
  uteam: { label: 'Unlimited Team', effect: 'is (unconfirmed) a one-round squad on an unlimited budget' },
  freehit: { label: 'Free Hit', effect: 'is a one-round squad' },
  bboost: { label: 'Bench Boost', effect: 'scores your bench too' },
  '3xc': { label: 'Triple Captain', effect: 'triples your captain' },
}

// What a chip adds in one round for the squad as it stands, in projected
// points. Attack Attack doubles the forwards, Park the Bus the defenders, Two
// Captains a second captain, Triple Captain the captain once more, Bench
// Boost the bench; a one-round transfer chip (rich uncle, uteam) is
// a squad on an unlimited budget, measured against the current XI. `def` is
// one of the league's `rules.chips`.
export function chipValueInRound(def, squad, projected, i, pool, teamLimit) {
  const { starters } = lineupIn(squad, projected, i)
  const points = p => p.projection.points
  if (def.name === 'frush') return sum(starters.filter(p => p.position === 4).map(points))
  if (def.name === 'pdbus') return sum(starters.filter(p => p.position === 2).map(points))
  if (def.name === '2capt') return starters[1] ? points(starters[1]) : 0
  if (def.name === '3xc') return starters[0] ? points(starters[0]) : 0
  if (def.name === 'bboost') {
    const ids = new Set(starters.map(p => p.id))
    return sum(squad.filter(p => !ids.has(p.id)).map(p => projected.get(p.id).perRound[i]))
  }
  if (def.type === 'transfer' && def.name !== 'wildcard') {
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
