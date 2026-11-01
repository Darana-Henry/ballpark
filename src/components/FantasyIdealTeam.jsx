import { useEffect, useRef, useState } from 'react'
import { useFantasyData } from '../contexts/fantasyData'
import { POSITIONS } from '../utils/fantasyPlayers'
import { derivePlan, rebuiltSquad, squadLineup } from '../utils/fantasyPlan'
import { sellPrice } from '../utils/fantasyPlanner'
import { pairMoves, facts, whySwap } from '../utils/fantasyExplain'
import { SquadPitch, WithSidePanel } from './FantasySquadPitch'
import { Fixtures } from './FantasyPlanRows'
import { panelStyle, fmt, useGames, NEW_BADGE, scrollIntoViewOnPhone } from './fantasyPlanShared'
import Chip from './FilterChip'

// The best 15 the user could own on their own budget (bank plus every
// player's sell price), for the next round or the next 3: who to keep, who to
// bring in, who to drop. The one-round version is what a free hit builds.
// Tapping a player explains the swap they're part of.

function Row({ p, price, tone, from, count, onSelect, selected }) {
  const { TEAMS, plan } = derivePlan(useFantasyData().data)
  const games = useGames()
  const Tag = onSelect ? 'button' : 'div'
  return (
    <Tag
      type={onSelect ? 'button' : undefined}
      onClick={onSelect ? () => onSelect(p.id) : undefined}
      className={`w-full text-left flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${onSelect ? 'hover:bg-white/[0.06]' : ''} ${selected ? 'ring-1 ring-amber-300/70' : ''}`}
      style={panelStyle}
    >
      <span className="w-8 text-[10px] font-semibold text-slate-500">{POSITIONS[p.position]}</span>
      <span className="flex-1 min-w-0 truncate">
        <span className={tone}>{p.name}</span>
        <span className="text-slate-500"> · {TEAMS[p.team].short} · £{price.toFixed(1)}</span>
      </span>
      <span className="hidden sm:flex"><Fixtures games={games(p, from, count)} /></span>
      <span className="w-10 text-right tabular-nums text-slate-400" title={`Projected pts over ${count} round${count > 1 ? 's' : ''}`}>{plan.total(p, from, count).toFixed(1)}</span>
    </Tag>
  )
}

/** Who a rebuilt squad brings in and drops, with sell prices for the drops. */
export function InOutLists({ squad, ins, outs, from, count, onSelect, selectedId }) {
  const { RULES } = derivePlan(useFantasyData().data)
  if (!ins.length) return <p className="text-xs text-slate-500">Your squad already is this team.</p>
  const row = (p, price, tone) => (
    <Row key={p.id} p={p} price={price} tone={tone} from={from} count={count} onSelect={onSelect} selected={selectedId === p.id} />
  )
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1.5">Bring in ({ins.length})</p>
        <div className="flex flex-col gap-1">{ins.map(p => row(p, p.price, 'text-slate-100 font-semibold'))}</div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-red-400 mb-1.5">Drop ({outs.length})</p>
        <div className="flex flex-col gap-1">{outs.map(p => row(p, sellPrice(squad.find(s => s.id === p.id) ?? p, RULES.sellOnFee), 'text-slate-400'))}</div>
      </div>
    </div>
  )
}

// One side of the comparison: the projection's inputs for one player.
function Side({ player, f, price, tone, from, count }) {
  const { TEAMS } = derivePlan(useFantasyData().data)
  const games = useGames()
  const attack = player.position >= 3
  return (
    <div className="flex-1 min-w-0 rounded-xl p-2.5 bg-white/[0.03]">
      <p className={`text-[10px] uppercase tracking-wider ${tone}`}>{tone.includes('emerald') ? 'Bring in' : 'Drop'}</p>
      <p className="text-sm font-semibold text-slate-100 truncate" title={player.fullName}>{player.name}</p>
      <p className="text-[11px] text-slate-500">{POSITIONS[player.position]} · {TEAMS[player.team].short} · £{price.toFixed(1)}</p>
      <div className="my-1.5"><Fixtures games={games(player, from, count)} /></div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-slate-500">Projected</dt><dd className="text-right font-bold text-slate-100 tabular-nums">{f.projected.toFixed(1)}</dd>
        <dt className="text-slate-500">Form (L4)</dt><dd className="text-right tabular-nums text-slate-300">{f.form.toFixed(1)}/rd</dd>
        <dt className="text-slate-500">Last 7</dt><dd className="text-right tabular-nums text-slate-300">{f.last7} pts</dd>
        <dt className="text-slate-500">Mins (L4)</dt><dd className="text-right tabular-nums text-slate-300">{f.minutes4}</dd>
        <dt className="text-slate-500">{attack ? 'Team goals' : 'Clean sheet'}</dt>
        <dd className="text-right tabular-nums text-slate-300">{attack ? f.teamGoals.toFixed(1) : f.cleanSheet != null ? `${Math.round(f.cleanSheet * 100)}%` : '–'}</dd>
        <dt className="text-slate-500">Fitness</dt>
        <dd className={`text-right tabular-nums ${f.fitness === 0 ? 'text-red-400' : f.fitness < 100 ? 'text-amber-300' : 'text-slate-300'}`}>{f.fitness === 0 ? player.availability : `${f.fitness}%`}</dd>
      </dl>
    </div>
  )
}

function Why({ id, moves, mine, from, count, label, onClose }) {
  const { plan, RULES } = derivePlan(useFantasyData().data)
  const ref = useRef(null)
  useEffect(() => scrollIntoViewOnPhone(ref.current), [id])
  const move = moves.find(m => m.in.id === id || m.out.id === id)
  let body
  if (move) {
    const owned = plan.squad.find(p => p.id === move.out.id) ?? move.out
    const sale = sellPrice(owned, RULES.sellOnFee)
    body = (
      <>
        <p className="text-xs text-slate-300 leading-relaxed mb-3">{whySwap(move.in, owned, plan, from, count, label, sale)}</p>
        <div className="flex gap-2">
          <Side player={move.in} f={facts(move.in, plan, from, count)} price={move.in.price} tone="text-emerald-400" from={from} count={count} />
          <Side player={owned} f={facts(owned, plan, from, count)} price={sale} tone="text-red-400" from={from} count={count} />
        </div>
      </>
    )
  } else {
    const p = plan.squad.find(x => x.id === id)
    body = p && mine.has(id)
      ? <p className="text-xs text-slate-300">{p.name} is already in your squad and stays: nobody in budget projects enough more over {label} to be worth swapping in.</p>
      : <p className="text-xs text-slate-500">No swap involves this player.</p>
  }
  return (
    <section ref={ref} className="rounded-2xl p-3 scroll-mb-24" style={panelStyle}>
      <header className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-bold text-slate-100">{move ? 'Why this transfer' : 'Keep'}</h3>
        <button onClick={onClose} className="ml-auto text-[11px] text-slate-500 hover:text-slate-300">Close</button>
      </header>
      {body}
    </section>
  )
}

export default function FantasyIdealTeam() {
  const { data } = useFantasyData()
  const { SQUAD_INFO, RULES, ROUND, HORIZON, plan } = derivePlan(data)
  const [count, setCount] = useState(1)
  const [selectedId, setSelectedId] = useState(null)

  if (!plan) {
    return <p className="text-sm text-slate-500 text-center py-10">{SQUAD_INFO ? 'The season is over.' : 'Your squad couldn\'t be fetched yet.'}</p>
  }

  const rounds = Math.min(count, HORIZON)
  const ideal = rebuiltSquad(data, 0, rounds)
  const lineup = squadLineup(ideal.squad, plan.byPlayer, 0, rounds)
  const moves = pairMoves(ideal.ins, ideal.outs)
  const mine = new Set(plan.squad.map(p => p.id))
  const budget = SQUAD_INFO.bank + plan.squad.reduce((s, p) => s + sellPrice(p, RULES.sellOnFee), 0)
  const hits = Math.max(0, ideal.ins.length - SQUAD_INFO.freeTransfers) * SQUAD_INFO.transferCost
  const label = rounds > 1 ? `GW${ROUND}–${ROUND + rounds - 1}` : `GW${ROUND}`
  const select = id => setSelectedId(s => (s === id ? null : id))
  // A dropped player's partner is highlighted on the pitch too.
  const partner = moves.find(m => m.out.id === selectedId)?.in.id

  return (
    <div className="max-w-3xl lg:max-w-none">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1">
          <Chip active={rounds === 1} onClick={() => { setCount(1); setSelectedId(null) }}>Next round</Chip>
          {HORIZON > 1 && <Chip active={rounds > 1} onClick={() => { setCount(3); setSelectedId(null) }}>Next {HORIZON} rounds</Chip>}
        </div>
        <span className="text-xs text-slate-600 ml-auto">Best squad on your £{budget.toFixed(1)}m · <span className="text-emerald-400">new</span> = bring in · tap a player for why</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 lg:max-w-[46rem]">
        {[
          ['Projected', `${fmt(ideal.gain)} pts`, `over your squad, ${label}`],
          ['Transfers', ideal.ins.length, ideal.ins.length ? `${SQUAD_INFO.freeTransfers} free · ${hits ? `−${hits} in hits` : 'no hit'}` : 'none needed'],
          ['Net', `${fmt(ideal.gain - hits)} pts`, hits ? 'after hits' : 'no hits'],
          ['Left in bank', `£${ideal.bank.toFixed(1)}m`, `of £${budget.toFixed(1)}m`],
        ].map(([title, value, note]) => (
          <div key={title} className="rounded-xl px-3 py-2" style={panelStyle}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{title}</p>
            <p className={`text-base font-bold truncate ${title === 'Net' ? (ideal.gain - hits >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-100'}`}>{value}</p>
            <p className="text-[11px] text-slate-500 truncate" title={note}>{note}</p>
          </div>
        ))}
      </div>

      <WithSidePanel
        side={selectedId && <Why id={selectedId} moves={moves} mine={mine} from={0} count={rounds} label={label} onClose={() => setSelectedId(null)} />}
        hint="Tap a new player on the pitch, or anyone in the lists below, to see why they come in and who they replace."
      >
        <SquadPitch
          lineup={lineup}
          rounds={rounds}
          cardProps={p => ({
            badge: mine.has(p.id) ? undefined : NEW_BADGE,
            selected: selectedId === p.id || partner === p.id,
            onClick: () => select(p.id),
          })}
        />
        <div className="mt-4">
          <InOutLists squad={plan.squad} ins={ideal.ins} outs={ideal.outs} from={0} count={rounds} onSelect={select} selectedId={selectedId} />
        </div>
      </WithSidePanel>

      <p className="text-[11px] text-slate-600 mt-4 leading-relaxed lg:max-w-[46rem]">
        Built from your squad by swapping players one at a time, then in pairs (a cheaper player to pay for a better one), while that raises the projection: your best XI plus captain over {label}.
        A player you already have is only replaced for a real gain. Points under each player are their projection over {label}. Each new player is paired with a drop at the same position, dearest with dearest.
        {rounds === 1 ? ' This is the squad a Free Hit would pick.' : ' This is close to what a Wildcard now would build.'}
        {' '}With {SQUAD_INFO.freeTransfers} free transfer{SQUAD_INFO.freeTransfers === 1 ? '' : 's'}, the Transfers tab shows which of these moves are worth it on their own.
      </p>
    </div>
  )
}
