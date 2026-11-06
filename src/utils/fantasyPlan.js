// The planning data every squad panel shares (My team, Ideal team, Transfers,
// Chips), worked out once per league: per-round projections for every player
// from the next deadline to the end of the season, the user's squad with its
// purchase prices, and the pool of players worth buying. Rebuilt squads and
// the chip plan are cached per league too: they're the slow part.

import { perLeague } from '../contexts/fantasyData'
import { POSITIONS, withForm, availability } from './fantasyPlayers'
import { pickLineup } from './fantasyLineup'
import { nextRound } from './fantasyFixtures'
import {
  projectRounds, planTransfers, squadScore, bestSquad, dreamSquad, chipBonus, chipTransfers, CHIPS, scoringFor,
} from './fantasyPlanner'

export const OUT = new Set(['injured', 'suspended', 'unavailable'])
export const MAX_MOVES = 5
// Chips are planned over the next 5 rounds: fixtures further out are too
// rough a guess to commit a chip to.
export const CHIP_WINDOW = 5
// A wildcard is judged over the 3 rounds from when it's played, like transfers.
const REBUILD_ROUNDS = 3

// A squad is 2 keepers, 5 defenders, 5 midfielders and 3 forwards in every game here.
const QUOTA = { 1: 2, 2: 5, 3: 5, 4: 3 }

export const derivePlan = perLeague(data => {
  const SQUAD_INFO = data.mySquad
  // Plans start at the next deadline: the round after the squad's, or with
  // no squad (the Champions League game's is behind a login) the first round
  // with a match still to play.
  const ROUND = SQUAD_INFO ? SQUAD_INFO.round + 1 : nextRound(data.fixtures)
  const LAST = Math.max(...data.fixtures.map(f => f.round ?? 0))
  // Transfers are judged over the next 3 rounds (fewer near the end of the season).
  const HORIZON = Math.max(0, Math.min(3, LAST - ROUND + 1))
  const consts = { SQUAD_INFO, RULES: data.rules, TEAMS: Object.fromEntries(data.teams.map(t => [t.id, t])), ROUND, LAST, HORIZON }
  // Without a squad the plan still exists (for the ideal team from scratch),
  // with an empty `squad` and the game's whole budget as the bank.
  return { ...consts, plan: HORIZON > 0 ? build(data, consts) : null }
})

function build(data, { SQUAD_INFO, RULES, ROUND, LAST, HORIZON }) {
  const players = data.players.map(p => ({ ...withForm(p), availability: availability(p) }))
  const { rounds, byPlayer } = projectRounds(players, data.fixtures, data.teams, ROUND, LAST - ROUND + 1)
  const picks = new Map((SQUAD_INFO?.picks ?? []).map(p => [p.id, p]))
  // A game that doesn't show what was paid (the Bundesliga's) sells at market value.
  const squad = players.filter(p => picks.has(p.id)).map(p => ({ ...p, purchasePrice: picks.get(p.id).purchasePrice ?? p.price }))
  const total = (p, from, count) => byPlayer.get(p.id).perRound.slice(from, from + count).reduce((a, b) => a + b, 0)
  const horizonTotal = p => total(p, 0, HORIZON)
  // Buyable: fit, has played, and among the 40 best projections at their
  // position over the rounds in question; plus each position's 3 cheapest
  // fit players, the bench fodder that pays for a rebuild's stars.
  const poolFor = (from, count) => Object.keys(POSITIONS).flatMap(pos => {
    const fit = players.filter(p => p.position === Number(pos) && !OUT.has(p.availability))
    // Points count as having played: an export not yet read in detail has no minutes.
    const best = fit.filter(p => p.minutesTotal > 0 || p.total > 0).sort((a, b) => total(b, from, count) - total(a, from, count)).slice(0, 40)
    const cheap = [...fit].sort((a, b) => a.price - b.price || b.minutesTotal - a.minutesTotal).slice(0, 3)
    return [...new Set([...best, ...cheap])]
  })
  const pool = poolFor(0, HORIZON)
  const bank = SQUAD_INFO ? SQUAD_INFO.bank : RULES.budget ?? 100
  const scoring = scoringFor(RULES)
  const common = { squad, pool, bank, projected: byPlayer, teamLimit: RULES.squadTeamLimit, sellOnFee: RULES.sellOnFee ?? 0, scoring, pointsScale: RULES.pointsScale ?? 1 }
  const transfers = squad.length
    ? planTransfers({ ...common, horizon: HORIZON, maxMoves: MAX_MOVES })
    : { moves: [], singles: [], gain: 0 }
  return { players, rounds, byPlayer, squad, pool, poolFor, total, horizonTotal, common, transfers }
}

/**
 * A squad's best XI, bench and captain over `count` rounds from round index
 * `from`, with each player's projection summed over them and their fixtures
 * in `games`: what the pitch views draw.
 */
export function squadLineup(squad, byPlayer, from, count, scoring) {
  return pickLineup(squad.map(p => {
    const { perRound, games } = byPlayer.get(p.id)
    return {
      ...p,
      games: games.slice(from, from + count).flat(),
      projection: { points: perRound.slice(from, from + count).reduce((a, b) => a + b, 0) },
    }
  }), scoring)
}

// Who goes and who comes between two squads, in squad order by position.
function difference(before, after) {
  const was = new Set(before.map(p => p.id))
  const now = new Set(after.map(p => p.id))
  const byPos = (a, b) => a.position - b.position || b.price - a.price
  return {
    ins: after.filter(p => !was.has(p.id)).sort(byPos),
    outs: before.filter(p => !now.has(p.id)).sort(byPos),
  }
}

const rebuilt = perLeague(() => new Map())

// The cheapest 15 that fill every position within the club limit: fit
// players only, the ones who've played first among equal prices.
function cheapestSquad(players, budget, teamLimit) {
  const left = { ...QUOTA }
  const perClub = new Map()
  const squad = []
  const byPrice = players
    .filter(p => !OUT.has(p.availability))
    .sort((a, b) => a.price - b.price || b.minutesTotal - a.minutesTotal)
  for (const p of byPrice) {
    if (!left[p.position] || (perClub.get(p.team) ?? 0) >= teamLimit) continue
    left[p.position]--
    perClub.set(p.team, (perClub.get(p.team) ?? 0) + 1)
    squad.push({ ...p, purchasePrice: p.price })
  }
  return { squad, bank: budget - squad.reduce((sum, p) => sum + p.price, 0) }
}

/**
 * The best squad within the user's budget (bank plus every player's sell
 * price) for `count` rounds from round index `from`: the ideal team, and what
 * a free hit or wildcard would build. `gain` is over the current squad.
 */
export function rebuiltSquad(data, from, count) {
  const cache = rebuilt(data)
  const key = `${from}:${count}`
  if (!cache.has(key)) {
    const { plan } = derivePlan(data)
    const { byPlayer, squad, poolFor, total, common, players } = plan
    const score = s => squadScore(s, byPlayer, count, from, common.scoring)
    // From scratch, the search starts at the cheapest legal squad and spends the rest.
    const start = squad.length ? { squad, bank: common.bank } : cheapestSquad(players, common.bank, common.teamLimit)
    const result = bestSquad({
      squad: start.squad, pool: poolFor(from, count), bank: start.bank, score,
      rank: p => total(p, from, count), teamLimit: common.teamLimit, sellOnFee: common.sellOnFee, shape: common.scoring.shape,
    })
    cache.set(key, { ...result, from, count, gain: result.score - score(squad), ...difference(squad, result.squad) })
  }
  return cache.get(key)
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Every chip's card and a calendar for the next CHIP_WINDOW rounds. Each
 * still-playable chip is valued round by round with the squad as it stands:
 *   boost       the extra points it scores (chipBonus), and who through
 *   oneRound    the best one-round squad on your budget, over your XI
 *   unlimited   the best one-round squad on any budget, over your XI
 *   rebuild     the best squad for 3 rounds from then, over yours, less what
 *               your best normal transfers would get anyway
 * The calendar then puts each chip in the round where it does most, one chip
 * a round, holding a chip whose best round doesn't stand out from the rest
 * (unless it expires inside the window).
 */
export const chipPlan = perLeague(data => {
  const { plan, SQUAD_INFO, RULES, ROUND, LAST } = derivePlan(data)
  const { byPlayer, squad, poolFor, transfers } = plan
  const end = Math.min(LAST, ROUND + CHIP_WINDOW - 1)
  const window = Array.from({ length: end - ROUND + 1 }, (_, i) => ({ round: ROUND + i, i }))
  // What normal transfers would add anyway, after hits: a wildcard only earns its extra.
  const normal = Math.max(0, ...Array.from({ length: MAX_MOVES }, (_, n) => {
    const moves = transfers.moves.slice(0, n + 1)
    return moves.reduce((s, m) => s + m.gain, 0) - Math.max(0, moves.length - SQUAD_INFO.freeTransfers) * SQUAD_INFO.transferCost
  }))

  const cards = RULES.chips.map((def, index) => {
    const meta = CHIPS[def.name] ?? { label: def.name }
    const card = { def, index, label: meta.label, kind: meta.kind }
    const used = SQUAD_INFO.chipsUsed.find(u => u.name === def.name && u.round >= def.start && u.round <= def.stop)
    if (used) return { ...card, status: 'used', used }
    if (def.stop < ROUND) return { ...card, status: 'expired' }
    const rounds = window.filter(r => r.round >= def.start && r.round <= def.stop)
    if (!rounds.length) return { ...card, status: 'later' }
    if (!meta.kind) return { ...card, status: 'unknown' }

    const values = rounds.map(r => {
      if (meta.kind === 'boost') {
        const { value, players } = chipBonus(def.name, squad, byPlayer, r.i)
        return { ...r, value, players }
      }
      if (meta.kind === 'unlimited') {
        const dream = dreamSquad(poolFor(r.i, 1), byPlayer, r.i, RULES.squadTeamLimit)
        return { ...r, value: squadScore(dream, byPlayer, 1, r.i) - squadScore(squad, byPlayer, 1, r.i), squad: dream, count: 1 }
      }
      const count = meta.kind === 'rebuild' ? Math.min(REBUILD_ROUNDS, LAST - r.round + 1) : 1
      const result = rebuiltSquad(data, r.i, count)
      // Normal transfers' worth is over the next 3 rounds; a late wildcard covers fewer.
      const value = meta.kind === 'rebuild' ? result.gain - normal * (count / REBUILD_ROUNDS) : result.gain
      return { ...r, value, squad: result.squad, count, gross: result.gain }
    })
    const best = values.reduce((a, b) => (b.value > a.value ? b : a))
    const typical = median(values.map(v => v.value))
    // Worth committing to: a wildcard that beats normal transfers by 10+,
    // anything else that's clearly above its usual value in this window.
    const standsOut = v => (meta.kind === 'rebuild' ? v.value >= 10 : v.value > 0.5 && (values.length === 1 || v.value >= typical * 1.2))
    const mustPlay = def.stop <= end
    return { ...card, status: 'open', values, best, standsOut, mustPlay, opensLater: def.start > ROUND }
  })

  // One chip per round: try every assignment of the open chips to their
  // eligible rounds (or holding them) and keep the highest total.
  const open = cards.filter(c => c.status === 'open')
  const choices = open.map(c => [
    ...(c.mustPlay ? [] : [null]),
    ...c.values.filter(v => c.mustPlay || c.standsOut(v)),
  ])
  let bestPlan = { total: -Infinity, picks: [] }
  const search = (k, taken, total, picks) => {
    if (k === open.length) {
      if (total > bestPlan.total) bestPlan = { total, picks: [...picks] }
      return
    }
    for (const v of choices[k]) {
      if (v && taken.has(v.round)) continue
      if (v) taken.add(v.round)
      picks.push(v)
      search(k + 1, taken, total + (v?.value ?? 0), picks)
      picks.pop()
      if (v) taken.delete(v.round)
    }
  }
  search(0, new Set(), 0, [])
  open.forEach((c, k) => { c.planned = bestPlan.picks[k] ?? null })

  return { cards, window, end, normal }
})

// Transfers that make a boost chip worth more, for its planned (or best) round.
const boosted = perLeague(() => new Map())
export function chipBoostTransfers(data, card) {
  const cache = boosted(data)
  const v = card.planned ?? card.best
  const key = `${card.def.name}:${v.i}`
  if (!cache.has(key)) {
    const { plan, HORIZON } = derivePlan(data)
    cache.set(key, chipTransfers(card.def.name, { ...plan.common, horizon: HORIZON }, v.i))
  }
  return cache.get(key)
}
