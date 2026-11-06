// Why a rebuilt squad (ideal team, wildcard, free hit) swaps one player for
// another, in the projection's own terms: form, minutes, fixtures, the
// team's projected goals or clean sheets, and fitness.

const OUT = new Set(['injured', 'suspended', 'unavailable'])
const ATTACK = new Set([3, 4])

/**
 * Pairs a rebuild's ins with its outs, like for like: within each position,
 * the dearest in replaces the dearest out. Where the squad shape is flexible
 * (the Bundesliga's), a rebuild can change how many play at a position, so
 * whoever is left over is paired across positions the same way.
 */
export function pairMoves(ins, outs) {
  const byPrice = (a, b) => b.price - a.price
  const moves = [1, 2, 3, 4].flatMap(pos => {
    const i = ins.filter(p => p.position === pos).sort(byPrice)
    const o = outs.filter(p => p.position === pos).sort(byPrice)
    return i.map((p, k) => ({ in: p, out: o[k] })).filter(m => m.out)
  })
  const paired = new Set(moves.flatMap(m => [m.in.id, m.out.id]))
  const restIn = ins.filter(p => !paired.has(p.id)).sort(byPrice)
  const restOut = outs.filter(p => !paired.has(p.id)).sort(byPrice)
  return [...moves, ...restIn.map((p, k) => ({ in: p, out: restOut[k] })).filter(m => m.out)]
}

/** The numbers behind a player's projection over `count` rounds from round index `from`. */
export function facts(p, plan, from, count) {
  const games = plan.byPlayer.get(p.id).games.slice(from, from + count).flat()
  const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
  return {
    projected: plan.total(p, from, count),
    form: p.last4 / 4,
    last7: p.last7,
    minutes4: p.minutes4,
    games: games.length,
    difficulty: mean(games.map(g => g.difficulty)),
    teamGoals: games.reduce((s, g) => s + g.goalsFor, 0),
    cleanSheet: mean(games.map(g => g.cleanSheet)),
    fitness: OUT.has(p.availability) ? 0 : p.chance ?? 100,
  }
}

/**
 * A sentence on why `incoming` replaces `outgoing`, strongest reasons first.
 * `sale` is what the outgoing player sells for.
 */
export function whySwap(incoming, outgoing, plan, from, count, label, sale = outgoing.price) {
  const a = facts(incoming, plan, from, count)
  const b = facts(outgoing, plan, from, count)
  const name = p => p.shortName ?? p.name
  const reasons = []
  if (b.fitness === 0) reasons.push(`${name(outgoing)} is ${outgoing.availability}${outgoing.news ? ` (${outgoing.news})` : ''}`)
  else if (b.fitness < 100) reasons.push(`${name(outgoing)} is only ${b.fitness}% to play`)
  if (b.games < a.games) reasons.push(b.games === 0 ? `${name(outgoing)} has no game` : `${name(incoming)} has ${a.games} games to ${b.games}`)
  // Form gaps are judged in the league's own points (the Bundesliga's are
  // tens of times the Premier League platform's): `pointsScale` from its rules.
  const unit = plan.common.pointsScale ?? 1
  if (a.form - b.form >= 0.75 * unit) reasons.push(`better form (${a.form.toFixed(1)} pts a round over the last 4, to ${b.form.toFixed(1)})`)
  if (b.minutes4 < 200 && a.minutes4 - b.minutes4 >= 90) reasons.push(`more minutes (${a.minutes4} in the last 4 rounds, to ${b.minutes4})`)
  if (a.difficulty != null && b.difficulty != null && b.difficulty - a.difficulty >= 0.5) {
    reasons.push(`easier fixtures (difficulty ${a.difficulty.toFixed(1)} on average, to ${b.difficulty.toFixed(1)})`)
  }
  if (ATTACK.has(incoming.position) && a.teamGoals - b.teamGoals >= 0.5) {
    reasons.push(`a team expected to score more (${a.teamGoals.toFixed(1)} goals over ${label}, to ${b.teamGoals.toFixed(1)})`)
  }
  if (!ATTACK.has(incoming.position) && a.cleanSheet != null && b.cleanSheet != null && a.cleanSheet - b.cleanSheet >= 0.08) {
    reasons.push(`better clean-sheet chances (${Math.round(a.cleanSheet * 100)}% a game, to ${Math.round(b.cleanSheet * 100)}%)`)
  }
  const gain = a.projected - b.projected
  const head = gain >= 0.05
    ? `${name(incoming)} projects ${gain.toFixed(1)} more pts than ${name(outgoing)} over ${label}`
    : `${name(incoming)} projects about the same as ${name(outgoing)} over ${label}`
  const caveats = []
  if (b.form - a.form >= 0.75 * unit) caveats.push(`${name(outgoing)} is in better form`)
  if (a.difficulty != null && b.difficulty != null && a.difficulty - b.difficulty >= 0.5) caveats.push(`${name(incoming)}'s fixtures are harder`)
  const price = incoming.price - sale
  const money = Math.abs(price) >= 0.05 ? ` The swap ${price > 0 ? 'costs' : 'frees'} £${Math.abs(price).toFixed(1)}m${price < 0 ? ' for upgrades elsewhere' : ''}.` : ''
  const why = reasons.length ? `: ${reasons.slice(0, 3).join(', ')}` : gain >= 0.05 ? ': a small edge in form and fixtures together' : (price < 0 ? ', and is cheaper' : '')
  return `${head}${why}.${caveats.length ? ` That's despite ${caveats.join(' and ')}.` : ''}${money}`
}

/**
 * Why a player is in a squad built from scratch: their projection over
 * `label`, where it ranks at their position among the players worth buying,
 * what drives it, and why the cheapest player projecting more isn't picked.
 * `C` is the league's currency sign.
 */
export function whyPick(player, plan, from, count, label, squad, C = '£') {
  const squadIds = new Set(squad.map(p => p.id))
  const f = facts(player, plan, from, count)
  const name = p => p.shortName ?? p.name
  const peers = plan.poolFor(from, count).filter(p => p.position === player.position)
  const ahead = peers.filter(p => plan.total(p, from, count) > f.projected && !squadIds.has(p.id))
  const rank = 1 + peers.filter(p => plan.total(p, from, count) > f.projected).length
  const bits = [`${f.form.toFixed(1)} pts a round over the last 4`, `${f.minutes4} minutes in them`]
  if (f.difficulty != null) bits.push(`fixtures averaging ${f.difficulty.toFixed(1)} on the 1–5 difficulty scale`)
  bits.push(ATTACK.has(player.position)
    ? `a team expected to score ${f.teamGoals.toFixed(1)} over ${label}`
    : `a ${Math.round((f.cleanSheet ?? 0) * 100)}% clean-sheet chance a game`)
  if (f.fitness < 100) bits.push(f.fitness === 0 ? `but ${player.availability}` : `though only ${f.fitness}% to play`)
  // The cheapest better option left out: dearer means the money does more
  // elsewhere; cheaper means the 3-per-club limit got in the way.
  const rival = [...ahead].sort((a, b) => a.price - b.price)[0]
  let tail = ''
  if (rival) {
    const gap = rival.price - player.price
    tail = gap > 0.05
      ? ` ${name(rival)} projects more but costs ${C}${gap.toFixed(1)}m more, which the budget gets more points from elsewhere.`
      : squad.filter(p => p.team === rival.team && p.id !== player.id).length >= plan.common.teamLimit
        ? ` ${name(rival)} projects more for no more money, but their club already has the maximum in this squad.`
        : ` ${name(rival)} is a close alternative for no more money.`
  }
  return `${name(player)} projects ${f.projected.toFixed(1)} pts over ${label}, #${rank} of ${peers.length} at the position: ${bits.join(', ')}.${tail}`
}
