// Where a Bundesliga player's points come from, from the app export's
// per-matchday scoring actions (`player.actions`, typed by `data.actionTypes`).
// Each action is in one of three groups:
//   minutes     playing time
//   underlying  the repeatable work: duels, passes, recoveries, shots, saves,
//               fouls and cards… a player can bank every week
//   returns     goals, assists and the team's goals, clean sheets and goals
//               conceded: rare, or not the player's own doing, so they swing
// "Repeatable" is minutes + underlying: what a player earns before any goal
// or clean sheet, the steadier guide to the weeks ahead.

export const GROUPS = {
  minutes:    { label: 'Minutes',    color: 'bg-slate-400',   text: 'text-slate-300' },
  underlying: { label: 'Underlying', color: 'bg-indigo-400',  text: 'text-indigo-300' },
  returns:    { label: 'Returns',    color: 'bg-emerald-400', text: 'text-emerald-300' },
}

/**
 * A player's breakdown over the last `window` matchdays (all of them for
 * Infinity), or null when the export hasn't broken any of them down.
 * Per-game figures are over the matchdays they played (any minutes).
 */
export function breakdown(player, types, window = Infinity) {
  const from = Math.max(0, player.actions.length - window)
  const rounds = player.actions.slice(from)
  if (rounds.every(r => r == null)) return null
  const totals = { minutes: 0, underlying: 0, returns: 0 }
  const byAction = new Map()
  const perRound = []
  let games = 0
  let minutes = 0
  rounds.forEach((actions, i) => {
    if (actions == null) return perRound.push(null)
    const split = { minutes: 0, underlying: 0, returns: 0 }
    for (const [type, count, points] of actions) {
      const t = types[type]
      split[t.group] += points
      const a = byAction.get(type) ?? { ...t, count: 0, points: 0 }
      a.count += count
      a.points += points
      byAction.set(type, a)
    }
    const played = (player.minutes[from + i] ?? 0) > 0
    if (played) {
      games++
      minutes += player.minutes[from + i]
    }
    for (const g in totals) totals[g] += split[g]
    perRound.push({ ...split, total: split.minutes + split.underlying + split.returns, played })
  })
  const per = v => (games ? v / games : 0)
  const points = totals.minutes + totals.underlying + totals.returns
  const repeatable = totals.minutes + totals.underlying
  return {
    games,
    minutes,
    points,
    perGame: per(points),
    minutesPerGame: per(totals.minutes),
    underlyingPerGame: per(totals.underlying),
    returnsPerGame: per(totals.returns),
    repeatablePerGame: per(repeatable),
    // Share of the points that didn't need a goal, assist or clean sheet.
    repeatableShare: points > 0 ? repeatable / points : null,
    valuePerGame: player.price ? per(repeatable) / player.price : null,
    actions: [...byAction.values()].map(a => ({ ...a, perGame: per(a.points), countPerGame: per(a.count) })).sort((a, b) => b.points - a.points),
    perRound,
  }
}

// How much of a player's own returns the steady form keeps; the rest is
// their position's average. Tested on the 2026/27 exports (matchdays 1–4
// predicting 5–8, 1–5 predicting 6–8, 3–6 predicting 7–8): repeatable plus a
// quarter of their own returns missed by about 37 pts a game against 46 for
// total points, and was as good or better in every split.
export const OWN_RETURNS = 0.25

/**
 * The league's data with each player's matchday points replaced by "steady"
 * points: minutes + underlying + OWN_RETURNS of their returns + the rest of
 * their position's average returns a game. Everything downstream (form,
 * projections, the ideal team) then runs on it unchanged. Matchdays the
 * export hasn't broken down keep their points; `seasonPoints` keeps the real
 * season total for the pitch cards. Cached per data file, so the plan
 * built from it is too.
 */
const steadyCache = new WeakMap()
export function steadyData(data) {
  if (steadyCache.has(data)) return steadyCache.get(data)
  const types = data.actionTypes
  const splitOf = actions => {
    const s = { minutes: 0, underlying: 0, returns: 0 }
    for (const [type, , points] of actions) s[types[type].group] += points
    return s
  }
  // Each position's average returns per game played.
  const sums = {}
  for (const p of data.players) {
    p.actions.forEach((a, i) => {
      if (!a || !(p.minutes[i] > 0)) return
      const s = (sums[p.position] ??= { returns: 0, games: 0 })
      s.returns += splitOf(a).returns
      s.games++
    })
  }
  const average = pos => (sums[pos]?.games ? sums[pos].returns / sums[pos].games : 0)
  const players = data.players.map(p => {
    if (!p.actions.some(a => a?.length)) return p
    const points = p.points.map((pts, i) => {
      const a = p.actions[i]
      if (!a || !(p.minutes[i] > 0)) return pts
      const s = splitOf(a)
      return s.minutes + s.underlying + OWN_RETURNS * s.returns + (1 - OWN_RETURNS) * average(p.position)
    })
    return { ...p, points, seasonPoints: p.points.reduce((sum, v) => sum + (v ?? 0), 0) }
  })
  const steady = { ...data, players, steady: { ownReturns: OWN_RETURNS, averageReturns: Object.fromEntries([1, 2, 3, 4].map(pos => [pos, average(pos)])) } }
  steadyCache.set(data, steady)
  return steady
}
