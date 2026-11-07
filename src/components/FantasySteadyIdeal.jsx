import { useMemo } from 'react'
import { FantasyDataContext, useFantasyData, useLabels } from '../contexts/fantasyData'
import { derivePlan, rebuiltSquad } from '../utils/fantasyPlan'
import { steadyData, OWN_RETURNS } from '../utils/fantasyActions'
import { POSITIONS } from '../utils/fantasyPlayers'
import FantasyIdealTeam from './FantasyIdealTeam'
import { panelStyle } from './fantasyPlanShared'

// The "Steady ideal" sub-tab (the Bundesliga's): the same Ideal team, built
// on steady form instead of total points. Each matchday counts minutes and
// underlying actions in full, a quarter of the player's own goals, assists
// and clean sheets, and the rest at their position's average (steadyData in
// fantasyActions.js), so one lucky goal doesn't buy a place. The Ideal team
// panel runs unchanged on that data; above it, who differs from the
// ordinary Ideal team.

function Differences({ data, steady }) {
  const { R } = useLabels()
  const { HORIZON, ROUND } = derivePlan(data)
  if (!HORIZON || !derivePlan(steady).plan) return null
  const usual = rebuiltSquad(data, 0, HORIZON).squad
  const now = rebuiltSquad(steady, 0, HORIZON).squad
  const ids = list => new Set(list.map(p => p.id))
  const inUsual = ids(usual)
  const inNow = ids(now)
  const byPos = (a, b) => a.position - b.position || b.price - a.price
  const only = now.filter(p => !inUsual.has(p.id)).sort(byPos)
  const dropped = usual.filter(p => !inNow.has(p.id)).sort(byPos)
  const name = p => <span key={p.id}><span className="text-slate-500">{POSITIONS[p.position]}</span> {p.shortName}</span>
  const list = players => players.map((p, i) => <span key={p.id}>{i ? ', ' : ''}{name(p)}</span>)
  const span = HORIZON > 1 ? `${R}${ROUND}–${ROUND + HORIZON - 1}` : `${R}${ROUND}`
  return (
    <p className="text-xs text-slate-300 mt-2">
      {only.length
        ? <>Against the Ideal team for {span}: <span className="text-emerald-300">in</span> {list(only)}; <span className="text-red-300">out</span> {list(dropped)}.</>
        : <>Same 15 as the Ideal team for {span}.</>}
    </p>
  )
}

export default function FantasySteadyIdeal() {
  const ctx = useFantasyData()
  const steady = steadyData(ctx.data)
  const value = useMemo(() => ({ ...ctx, data: steady }), [ctx, steady])
  const broken = ctx.data.players.filter(p => p.actions?.some(a => a?.length)).length
  const avg = steady.steady.averageReturns
  return (
    <>
      <section className="rounded-xl p-3 mb-4 max-w-4xl" style={panelStyle}>
        <p className="text-sm font-semibold text-slate-100">Picked on steady form</p>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          The Ideal team, with each player's form counting what they can repeat every week: minutes and underlying actions in full, {Math.round(OWN_RETURNS * 100)}% of their own goals, assists and clean sheets, and the rest at their position's average
          ({Object.entries(POSITIONS).map(([pos, label]) => `${label} ${Math.round(avg[pos])}`).join(', ')} a game). Fixtures and fitness then work as everywhere else.
          On this season's matchdays it predicted the next ones better than total points (missing by about 37 pts a game against 46).
          Form, projections and the reasons when you tap a player are all in steady points; the season points on the cards are the real ones.
          {broken < ctx.data.players.length && ` So far ${broken} of ${ctx.data.players.length} players are broken down; the rest still count their total points.`}
        </p>
        <Differences data={ctx.data} steady={steady} />
      </section>
      <FantasyDataContext.Provider value={value}>
        <FantasyIdealTeam />
      </FantasyDataContext.Provider>
    </>
  )
}
