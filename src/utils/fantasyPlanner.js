// Transfer, squad and chip suggestions for the user's squad, built on the
// same projection as the My team pitch (fantasyLineup.js): form × fixture ×
// chance of playing, per round.
//
// A squad is scored over a run of rounds as the sum, round by round, of its
// best XI plus the captain counted twice, so a bench upgrade is worth little
// and a starter upgrade a lot, as in the game.
//
// `scoring` (from scoringFor(rules)) covers the games that differ: the
// Bundesliga's 3 star players (the best defender, midfielder and forward in
// the XI score 1.5×) instead of a captain, and its flexible squad shape
// (4–6 defenders, 4–6 midfielders, 2–4 forwards), where an outfield player
// can be swapped for one at another position.

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

/** How a league scores a squad, from its `rules`: stars or a captain, and the squad shape. */
export function scoringFor(rules) {
  return { stars: rules?.captaincy === 'stars', shape: rules?.squadShape ?? null }
}
const CAPTAIN = { stars: false, shape: null }

/** The best XI, bench and captain (or star players) of `squad` in round index `i`. */
export function lineupIn(squad, projected, i, scoring = CAPTAIN) {
  return pickLineup(squad.map(p => ({ ...p, projection: { points: projected.get(p.id).perRound[i] } })), scoring)
}

const byDesc = (a, b) => b - a

// Best XI plus captain (or star players), summed over `horizon` rounds from
// round index `from`. The same pick as pickLineup (each position's minimum,
// then the best of the rest up to its maximum), on bare numbers: searches
// score many squads. The best defender, midfielder and forward always start
// (every formation fields at least one), so they're the star players.
export function squadScore(squad, projected, horizon, from = 0, scoring = CAPTAIN) {
  let total = 0
  for (let i = from; i < from + horizon; i++) {
    const pts = { 1: [], 2: [], 3: [], 4: [] }
    for (const p of squad) pts[p.position].push(projected.get(p.id).perRound[i] ?? 0)
    for (const list of Object.values(pts)) list.sort(byDesc)
    const starters = [...pts[1].slice(0, 1), ...pts[2].slice(0, 3), ...pts[3].slice(0, 2), ...pts[4].slice(0, 1)]
    const rest = [...pts[2].slice(3, 5), ...pts[3].slice(2, 5), ...pts[4].slice(1, 3)].sort(byDesc).slice(0, 11 - starters.length)
    const bonus = scoring.stars
      ? 0.5 * [2, 3, 4].reduce((s, pos) => s + Math.max(0, pts[pos][0] ?? 0), 0)
      : Math.max(0, ...starters, ...rest)
    total += sum(starters) + sum(rest) + bonus
  }
  return total
}

// The game keeps half of a price rise when selling (rounded down to £0.1m),
// and passes a fall on in full.
export function sellPrice(player, sellOnFee) {
  const rise = Math.round((player.price - player.purchasePrice) * 10)
  return rise <= 0 ? player.price : player.purchasePrice + Math.floor(rise * sellOnFee) / 10
}

const bought = p => ({ ...p, purchasePrice: p.price })

function clubCounts(squad) {
  const perClub = new Map()
  for (const p of squad) perClub.set(p.team, (perClub.get(p.team) ?? 0) + 1)
  return perClub
}

// Whether `cand` can replace `out`: the same position, or, where the squad
// shape is flexible, another outfield position that keeps every position
// within its range (keepers are always swapped for keepers).
function positionFits(out, cand, counts, shape) {
  if (cand.position === out.position) return true
  if (!shape || out.position === 1 || cand.position === 1) return false
  return counts[out.position] - 1 >= shape[out.position][0] && counts[cand.position] + 1 <= shape[cand.position][1]
}

// Every legal swap for each of `outs`: a position that fits, within budget
// and the per-club limit. Returns, per out, its best `keep` options by gain
// in `score`, over `base` (the current squad's score).
function swaps({ current, money, pool, score, base, teamLimit, sellOnFee, shape = null, outs = current, keep = 5 }) {
  const owned = new Set(current.map(p => p.id))
  const perClub = clubCounts(current)
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const p of current) counts[p.position]++
  return outs.map(out => {
    const budget = money + sellPrice(out, sellOnFee)
    const options = []
    for (const cand of pool) {
      if (!positionFits(out, cand, counts, shape) || owned.has(cand.id) || cand.price > budget + 1e-9) continue
      if (cand.team !== out.team && (perClub.get(cand.team) ?? 0) >= teamLimit) continue
      const next = current.map(p => (p.id === out.id ? bought(cand) : p))
      options.push({ out, in: cand, gain: score(next) - base })
    }
    return options.sort((a, b) => b.gain - a.gain).slice(0, keep)
  })
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
export function planTransfers({ squad, pool, bank, projected, horizon, teamLimit, sellOnFee, maxMoves, scoring = CAPTAIN }) {
  const score = s => squadScore(s, projected, horizon, 0, scoring)
  let current = [...squad]
  let money = bank
  let base = score(current)
  const start = base
  const moves = []
  let singles = []
  for (let step = 0; step < maxMoves; step++) {
    const perOut = swaps({ current, money, pool, score, base, teamLimit, sellOnFee, shape: scoring.shape })
    if (step === 0) singles = perOut.flat().sort((a, b) => b.gain - a.gain).slice(0, 5)
    const best = perOut.filter(o => o.length).reduce((a, o) => (!a || o[0].gain > a[0].gain ? o : a), null)
    if (!best || best[0].gain < 0.05) break
    const move = best[0]
    moves.push({ ...move, options: best, bankAfter: money + sellPrice(move.out, sellOnFee) - move.in.price })
    money = moves.at(-1).bankAfter
    current = current.map(p => (p.id === move.out.id ? bought(move.in) : p))
    base += move.gain
  }
  return { moves, singles, gain: base - start }
}

/** The best `keep` replacements for one player in `squad`, by gain over `horizon` rounds. */
export function replacementsFor(out, { squad, pool, bank, projected, horizon, teamLimit, sellOnFee, scoring = CAPTAIN }, keep = 5) {
  const score = s => squadScore(s, projected, horizon, 0, scoring)
  return swaps({ current: squad, money: bank, pool, score, base: score(squad), teamLimit, sellOnFee, shape: scoring.shape, outs: [out], keep })[0]
}

/**
 * The best squad reachable from `squad` with unlimited transfers (a wildcard
 * or free hit), by local search: the best single swap while one helps, then
 * the best pair of swaps (a downgrade paying for an upgrade, which no single
 * swap finds), until neither helps. Starting from the user's squad, a player
 * is only replaced for a real gain. The pair search tries each position's
 * top 10 by `rank` and its 3 cheapest.
 */
export function bestSquad({ squad, pool, bank, score, rank, teamLimit, sellOnFee, shape = null }) {
  let current = [...squad]
  let money = bank
  let base = score(current)
  const opts = { pool, score, teamLimit, sellOnFee, shape }
  const shortlist = Object.fromEntries([1, 2, 3, 4].map(pos => {
    const at = pool.filter(p => p.position === pos)
    const top = [...at].sort((a, b) => rank(b) - rank(a)).slice(0, 10)
    const cheap = [...at].sort((a, b) => a.price - b.price).slice(0, 3)
    return [pos, [...new Set([...top, ...cheap])]]
  }))
  const apply = list => {
    for (const s of list) {
      money += sellPrice(s.out, sellOnFee) - s.in.price
      current = current.map(p => (p.id === s.out.id ? bought(s.in) : p))
    }
  }

  for (let guard = 0; guard < 60; guard++) {
    const single = swaps({ ...opts, current, money, base, keep: 1 }).flat().reduce((a, s) => (!a || s.gain > a.gain ? s : a), null)
    if (single && single.gain >= 0.05) {
      apply([single])
      base += single.gain
      continue
    }
    // Pairs stay like for like: across positions, singles cover it.
    const pair = bestPair(current, money, shortlist, base, opts)
    if (!pair || pair.gain < 0.05) break
    apply(pair.swaps)
    base += pair.gain
  }
  return { squad: current, bank: money, score: base }
}

function bestPair(current, money, shortlist, base, { score, teamLimit, sellOnFee }) {
  const owned = new Set(current.map(p => p.id))
  let best = null
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      const a = current[i]
      const b = current[j]
      const budget = money + sellPrice(a, sellOnFee) + sellPrice(b, sellOnFee)
      const perClub = clubCounts(current.filter(p => p !== a && p !== b))
      for (const x of shortlist[a.position]) {
        if (owned.has(x.id) || x.price > budget + 1e-9 || (perClub.get(x.team) ?? 0) >= teamLimit) continue
        for (const y of shortlist[b.position]) {
          if (y === x || owned.has(y.id) || x.price + y.price > budget + 1e-9) continue
          if ((perClub.get(y.team) ?? 0) + (y.team === x.team ? 1 : 0) >= teamLimit) continue
          const next = current.map(p => (p === a ? bought(x) : p === b ? bought(y) : p))
          const gain = score(next) - base
          if (!best || gain > best.gain) best = { gain, swaps: [{ out: a, in: x }, { out: b, in: y }] }
        }
      }
    }
  }
  return best
}

// Chips in the game's feeds → what the games call them and, as fan guides
// describe them, what they do (the feeds don't say). `uteam` is
// Allsvenskan's; its name and effect aren't confirmed anywhere, but the game
// marks it a transfer chip from round 2, like Eliteserien's rich uncle.
// `kind` is how the planner treats it: a one-round boost to the squad, a
// one-round squad (on your budget or an unlimited one), or a rebuild.
export const CHIPS = {
  wildcard: { label: 'Wildcard', kind: 'rebuild' },
  frush: { label: 'Attack Attack', effect: 'doubles your forwards', kind: 'boost' },
  pdbus: { label: 'Park the Bus', effect: 'doubles your defenders', kind: 'boost' },
  '2capt': { label: 'Two Captains', effect: 'doubles a second player', kind: 'boost' },
  rich: { label: 'Rich Uncle', effect: 'is a one-round squad on an unlimited budget', kind: 'unlimited' },
  uteam: { label: 'Unlimited Team', effect: 'is (unconfirmed) a one-round squad on an unlimited budget', kind: 'unlimited' },
  freehit: { label: 'Free Hit', effect: 'is a one-round squad', kind: 'oneRound' },
  bboost: { label: 'Bench Boost', effect: 'scores your bench too', kind: 'boost' },
  '3xc': { label: 'Triple Captain', effect: 'triples your captain', kind: 'boost' },
}

/**
 * What a boost chip adds in round index `i` for `squad`, in projected points,
 * and the players it scores through: Attack Attack the starting forwards,
 * Park the Bus the starting defenders, Two Captains the second-best starter,
 * Triple Captain the captain, Bench Boost the bench. Null for other chips.
 */
export function chipBonus(name, squad, projected, i) {
  const { starters, bench } = lineupIn(squad, projected, i)
  const through = players => ({ value: sum(players.map(p => p.projection.points)), players })
  if (name === 'frush') return through(starters.filter(p => p.position === 4))
  if (name === 'pdbus') return through(starters.filter(p => p.position === 2))
  if (name === '2capt') return through(starters.slice(1, 2))
  if (name === '3xc') return through(starters.slice(0, 1))
  if (name === 'bboost') return through(bench)
  return null
}

/**
 * The best transfers ahead of a boost chip: single swaps scored on the
 * normal `horizon` plus the chip's bonus in round index `i`, so a defender
 * who doubles well under Park the Bus rises up the list. Only the players the
 * chip works through are swapped (defenders for Park the Bus, forwards for
 * Attack Attack; anyone otherwise).
 */
export function chipTransfers(name, { squad, pool, bank, projected, horizon, teamLimit, sellOnFee }, i, keep = 3) {
  const score = s => squadScore(s, projected, horizon) + chipBonus(name, s, projected, i).value
  const position = { pdbus: 2, frush: 4 }[name]
  const outs = position ? squad.filter(p => p.position === position) : squad
  return swaps({ current: squad, money: bank, pool, score, base: score(squad), teamLimit, sellOnFee, outs, keep: 1 })
    .flat().filter(s => s.gain >= 0.05).sort((a, b) => b.gain - a.gain).slice(0, keep)
}

/**
 * The best squad money can't buy for round index `i`: the top projected
 * players at each position, at most `teamLimit` per club.
 */
export function dreamSquad(pool, projected, i, teamLimit) {
  const ranked = [...pool].sort((a, b) => projected.get(b.id).perRound[i] - projected.get(a.id).perRound[i])
  const quota = { 1: 2, 2: 5, 3: 5, 4: 3 }
  const perClub = new Map()
  const squad = []
  for (const p of ranked) {
    if (!quota[p.position] || (perClub.get(p.team) ?? 0) >= teamLimit) continue
    quota[p.position]--
    perClub.set(p.team, (perClub.get(p.team) ?? 0) + 1)
    squad.push(bought(p))
  }
  return squad
}
