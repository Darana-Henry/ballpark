import { useState } from 'react'
import { useFantasyData } from '../contexts/fantasyData'
import { derivePlan, MAX_MOVES, OUT } from '../utils/fantasyPlan'
import { sellPrice } from '../utils/fantasyPlanner'
import { Fixtures, PlayerSide, SwapLine } from './FantasyPlanRows'
import { panelStyle, fmt, useGames } from './fantasyPlanShared'
import Chip from './FilterChip'

// The Transfers sub-tab: a greedy 1–5 transfer plan over the next 3 rounds,
// the top single swaps, and the squad's dead weight. Chips have their own tab.

function Move({ move, plan, index }) {
  const { TEAMS, RULES } = derivePlan(useFantasyData().data)
  const games = useGames()
  const [open, setOpen] = useState(false)
  const { horizonTotal } = plan
  return (
    <div className="rounded-xl p-3" style={panelStyle}>
      <div className="flex items-start sm:items-center gap-3">
        <span className="text-xs font-bold text-slate-500 w-4 pt-0.5 sm:pt-0">{index + 1}</span>
        {/* Out above in on phones, side by side from sm up */}
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <PlayerSide player={move.out} price={sellPrice(move.out, RULES.sellOnFee)} total={horizonTotal(move.out)} games={games(move.out)} muted />
          <span className="text-slate-500 text-lg leading-none rotate-90 sm:rotate-0 w-fit">→</span>
          <PlayerSide player={move.in} price={move.in.price} total={horizonTotal(move.in)} games={games(move.in)} />
        </div>
        <span className="text-sm font-bold text-emerald-400 tabular-nums w-12 text-right">{fmt(move.gain)}</span>
      </div>
      {move.options.length > 1 && (
        <button onClick={() => setOpen(v => !v)} className="mt-2 ml-7 text-[11px] text-slate-500 hover:text-slate-300">
          {open ? 'Hide' : 'Show'} other options for {move.out.shortName} ({move.options.length})
        </button>
      )}
      {open && (
        <div className="mt-2 ml-7 flex flex-col gap-1">
          {move.options.map(o => (
            <div key={o.in.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-slate-300">{o.in.name} <span className="text-slate-500">· {TEAMS[o.in.team].short} · £{o.in.price.toFixed(1)}</span></span>
              <Fixtures games={games(o.in)} />
              <span className="w-12 text-right tabular-nums text-emerald-400/80">{fmt(o.gain)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FantasyPlanner() {
  const { SQUAD_INFO, RULES, ROUND, HORIZON, plan } = derivePlan(useFantasyData().data)
  const games = useGames()
  const [count, setCount] = useState(1)

  if (!plan) {
    return <p className="text-sm text-slate-500 text-center py-10">{SQUAD_INFO ? 'The season is over.' : 'Your squad couldn\'t be fetched yet.'}</p>
  }

  const moves = plan.transfers.moves.slice(0, count)
  const gain = moves.reduce((s, m) => s + m.gain, 0)
  const hits = Math.max(0, moves.length - SQUAD_INFO.freeTransfers) * SQUAD_INFO.transferCost
  const bankAfter = moves.at(-1)?.bankAfter ?? SQUAD_INFO.bank
  const deadWeight = [...plan.squad].sort((a, b) => plan.horizonTotal(a) - plan.horizonTotal(b)).slice(0, 4)
  const roundsLabel = HORIZON > 1 ? `GW${ROUND}–${ROUND + HORIZON - 1}` : `GW${ROUND}`

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        {[
          ['Planning for', roundsLabel, `from your GW${SQUAD_INFO.round} squad`],
          ['Free transfers', SQUAD_INFO.freeTransfers, `estimated · −${SQUAD_INFO.transferCost} pts per extra`],
          ['In the bank', `£${SQUAD_INFO.bank.toFixed(1)}m`, `sell-on fee ${RULES.sellOnFee * 100}% of a rise`],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl px-3 py-2" style={panelStyle}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-base font-bold text-slate-100">{value}</p>
            <p className="text-[11px] text-slate-500 truncate" title={note}>{note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1">
          {Array.from({ length: MAX_MOVES }, (_, i) => i + 1).map(n => (
            <Chip key={n} active={count === n} onClick={() => setCount(n)}>
              {n}<span className="hidden sm:inline"> transfer{n > 1 ? 's' : ''}</span>
            </Chip>
          ))}
        </div>
      </div>

      {moves.length ? (
        <>
          <div className="flex flex-col gap-2">
            {moves.map((m, i) => <Move key={m.out.id} move={m} plan={plan} index={i} />)}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {fmt(gain)} projected pts over {roundsLabel}
            {hits > 0 && <> · <span className="text-red-400">−{hits} hit</span> · net <span className={gain - hits > 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(gain - hits)}</span></>}
            {' '}· £{bankAfter.toFixed(1)}m left
            {moves.length < count && ` · only ${moves.length} transfer${moves.length > 1 ? 's' : ''} improve${moves.length > 1 ? '' : 's'} the squad`}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500 py-4">No transfer improves your squad over {roundsLabel}. Roll the transfer.</p>
      )}

      {count === 1 && plan.transfers.singles.length > 1 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Top 5 single transfers</p>
          <div className="flex flex-col gap-1">
            {plan.transfers.singles.map(s => <SwapLine key={`${s.out.id}-${s.in.id}`} swap={s} games={games(s.in)} />)}
          </div>
        </div>
      )}

      <h3 className="text-sm font-bold text-slate-200 mt-6 mb-2">Dead weight</h3>
      <p className="text-[11px] text-slate-500 mb-2">Your four lowest projections over {roundsLabel}: first in line to go. Tap any player on the My team pitch for their best replacements.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {deadWeight.map(p => (
          <div key={p.id} className="rounded-xl p-3 flex items-center gap-3" style={panelStyle}>
            <PlayerSide player={p} price={sellPrice(p, RULES.sellOnFee)} total={plan.horizonTotal(p)} games={games(p)} muted />
            <span className="text-[11px] text-slate-500 text-right max-w-[9rem]">
              {OUT.has(p.availability) ? <span className="text-red-400">{p.availability}</span> : p.chance != null && p.chance < 100 ? <span className="text-amber-400">{p.chance}% to play</span> : `${p.last4} pts in last 4`}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-600 mt-4 leading-relaxed">
        Projections are the My team ones (form × fixture × chance of playing), scored as your best XI plus captain each round, so bench upgrades count for little.
        Sell prices include the {RULES.sellOnFee * 100}% sell-on fee. Free transfers are replayed from your history and checked against the hits you paid.
        Transfers you've already made for GW{ROUND} don't show until its deadline.
      </p>
    </div>
  )
}
