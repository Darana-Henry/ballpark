import { useState } from 'react'
import { useFantasyData, perLeague } from '../contexts/fantasyData'
import { POSITIONS, withForm, availability } from '../utils/fantasyPlayers'
import { DIFFICULTY } from '../utils/fantasyFixtures'
import { projectRounds, planTransfers, chipValueInRound, sellPrice, CHIPS } from '../utils/fantasyPlanner'
import Chip from './FilterChip'

const MAX_MOVES = 5
const OUT = new Set(['injured', 'suspended', 'unavailable'])

const panelStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
const fmt = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1)

// The whole plan, once per league: transfers, wildcard rebuild and per-round
// projections for every player.
const derive = perLeague(data => {
  const SQUAD_INFO = data.mySquad
  // Plans start at the next deadline: the round after the squad's.
  const ROUND = (SQUAD_INFO?.round ?? 0) + 1
  const LAST = Math.max(...data.fixtures.map(f => f.round ?? 0))
  // Transfers are judged over the next 3 rounds (fewer near the end of the season).
  const HORIZON = Math.max(0, Math.min(3, LAST - ROUND + 1))
  const consts = { SQUAD_INFO, RULES: data.rules, TEAMS: Object.fromEntries(data.teams.map(t => [t.id, t])), ROUND, LAST, HORIZON }
  return { ...consts, plan: SQUAD_INFO && HORIZON > 0 ? build(data, consts) : null }
})

function build(data, { SQUAD_INFO, RULES, ROUND, LAST, HORIZON }) {
  const players = data.players.map(p => ({ ...withForm(p), availability: availability(p) }))
  const { rounds, byPlayer } = projectRounds(players, data.fixtures, data.teams, ROUND, LAST - ROUND + 1)
  const picks = new Map(SQUAD_INFO.picks.map(p => [p.id, p]))
  const squad = players.filter(p => picks.has(p.id)).map(p => ({ ...p, purchasePrice: picks.get(p.id).purchasePrice }))
  const horizonTotal = p => byPlayer.get(p.id).perRound.slice(0, HORIZON).reduce((a, b) => a + b, 0)
  // Buyable: fit, has played, and among the 40 best projections at their position.
  const pool = Object.keys(POSITIONS).flatMap(pos => players
    .filter(p => p.position === Number(pos) && !OUT.has(p.availability) && p.minutesTotal > 0)
    .sort((a, b) => horizonTotal(b) - horizonTotal(a))
    .slice(0, 40))
  const common = { squad, pool, bank: SQUAD_INFO.bank, projected: byPlayer, teamLimit: RULES.squadTeamLimit, sellOnFee: RULES.sellOnFee }
  const transfers = planTransfers({ ...common, horizon: HORIZON, maxMoves: MAX_MOVES })
  // A wildcard rebuilds freely: as many swaps as help, no hits.
  const wildcard = planTransfers({ ...common, horizon: HORIZON, maxMoves: 15 })
  return { rounds, byPlayer, squad, pool, transfers, wildcard, horizonTotal }
}

function Fixtures({ games }) {
  const { TEAMS } = derive(useFantasyData().data)
  return (
    <span className="flex gap-0.5">
      {games.map((round, i) => (
        <span key={i} className="flex flex-col gap-px">
          {round.length ? round.map((g, j) => (
            <span key={j} className={`px-1 rounded text-[9px] font-semibold leading-4 whitespace-nowrap ${DIFFICULTY[g.difficulty].className}`}>
              {TEAMS[g.opponent].short}{g.home ? '' : '·a'}
            </span>
          )) : <span className="px-1 rounded text-[9px] leading-4 bg-slate-800 text-slate-500">—</span>}
        </span>
      ))}
    </span>
  )
}

function PlayerSide({ player, price, total, games, muted }) {
  const { TEAMS } = derive(useFantasyData().data)
  return (
    <div className="min-w-0 flex-1">
      <p className={`text-sm font-semibold truncate ${muted ? 'text-slate-400' : 'text-slate-100'}`} title={player.fullName}>{player.name}</p>
      <p className="text-[11px] text-slate-500 truncate">
        {POSITIONS[player.position]} · {TEAMS[player.team].short} · £{price.toFixed(1)} · {total.toFixed(1)} pts
      </p>
      <div className="mt-1"><Fixtures games={games} /></div>
    </div>
  )
}

function Move({ move, plan, index }) {
  const { TEAMS, RULES, HORIZON } = derive(useFantasyData().data)
  const [open, setOpen] = useState(false)
  const { byPlayer, horizonTotal } = plan
  const games = p => byPlayer.get(p.id).games.slice(0, HORIZON)
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

function ChipCard({ def, plan }) {
  const { SQUAD_INFO, RULES, ROUND, LAST, HORIZON } = derive(useFantasyData().data)
  const label = CHIPS[def.name]?.label ?? def.name
  const used = SQUAD_INFO.chipsUsed.find(u => u.name === def.name && u.round >= def.start && u.round <= def.stop)
  const window = def.start === 1 && def.stop >= LAST ? 'any round' : `GW${def.start}–${def.stop}`
  if (used) {
    return (
      <div className="rounded-xl p-3 opacity-60" style={panelStyle}>
        <p className="text-sm font-semibold text-slate-300">{label} <span className="text-[11px] font-normal text-slate-500">· {window}</span></p>
        <p className="text-xs text-slate-500 mt-1">Used in GW{used.round} · scored {SQUAD_INFO.points[used.round] ?? '–'} pts that round</p>
      </div>
    )
  }
  if (def.stop < ROUND) {
    return (
      <div className="rounded-xl p-3 opacity-60" style={panelStyle}>
        <p className="text-sm font-semibold text-slate-300">{label} <span className="text-[11px] font-normal text-slate-500">· {window}</span></p>
        <p className="text-xs text-slate-500 mt-1">Expired unused after GW{def.stop}</p>
      </div>
    )
  }

  const rounds = plan.rounds.map((round, i) => ({ round, i })).filter(r => r.round >= def.start && r.round <= def.stop)
  let advice
  let values = null
  if (def.name === 'wildcard') {
    const free = Math.max(0, ...[1, 2, 3, 4, 5].map(n => {
      const moves = plan.transfers.moves.slice(0, n)
      return moves.reduce((s, m) => s + m.gain, 0) - Math.max(0, moves.length - SQUAD_INFO.freeTransfers) * SQUAD_INFO.transferCost
    }))
    const extra = plan.wildcard.gain - free
    advice = extra >= 10
      ? `Play it for GW${ROUND}: a rebuild of ${plan.wildcard.moves.length} transfers adds ${extra.toFixed(1)} pts over the next ${HORIZON} rounds beyond your best normal transfers.`
      : `Hold for now: a rebuild adds only ${extra.toFixed(1)} pts over the next ${HORIZON} rounds beyond your best normal transfers. It must be played by GW${def.stop}, so keep it for an injury crisis or a round with doubles.`
  } else {
    values = rounds.map(r => ({ ...r, value: chipValueInRound(def, plan.squad, plan.byPlayer, r.i, plan.pool, RULES.squadTeamLimit) }))
    const best = values.reduce((a, b) => (b.value > a.value ? b : a), values[0])
    if (values.some(v => v.value == null)) {
      // A chip the planner doesn't know how to score.
      values = null
      advice = 'No projection for this chip yet.'
    } else {
      advice = best ? `Best in GW${best.round} with your current squad: about ${best.value.toFixed(1)} extra pts.` : 'No rounds left to play it.'
    }
  }
  const max = values ? Math.max(1, ...values.map(v => v.value)) : 1

  return (
    <div className="rounded-xl p-3 ring-1 ring-inset ring-indigo-500/30" style={panelStyle}>
      <p className="text-sm font-semibold text-slate-100">{label} <span className="text-[11px] font-normal text-slate-500">· {window} · available</span></p>
      <p className="text-xs text-slate-300 mt-1">{advice}</p>
      {values && (
        <div className="flex items-end gap-1 mt-2 h-12">
          {values.map(v => (
            <div key={v.round} className="flex-1 flex flex-col items-center gap-0.5" title={`GW${v.round}: +${v.value.toFixed(1)} pts`}>
              <div className="w-full rounded-t bg-indigo-400/70" style={{ height: `${Math.max(2, (v.value / max) * 32)}px` }} />
              <span className="text-[9px] text-slate-500">{v.round}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FantasyPlanner() {
  const { SQUAD_INFO, RULES, TEAMS, ROUND, HORIZON, plan } = derive(useFantasyData().data)
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {[
          ['Planning for', roundsLabel, `from your GW${SQUAD_INFO.round} squad`],
          ['Free transfers', SQUAD_INFO.freeTransfers, `estimated · −${SQUAD_INFO.transferCost} pts per extra`],
          ['In the bank', `£${SQUAD_INFO.bank.toFixed(1)}m`, `sell-on fee ${RULES.sellOnFee * 100}% of a rise`],
          ['Chips left', RULES.chips.filter(c => c.stop >= ROUND && !SQUAD_INFO.chipsUsed.some(u => u.name === c.name && u.round >= c.start && u.round <= c.stop)).length, `of ${RULES.chips.length} this season`],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl px-3 py-2" style={panelStyle}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-base font-bold text-slate-100">{value}</p>
            <p className="text-[11px] text-slate-500 truncate" title={note}>{note}</p>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-bold text-slate-200 mb-2">Transfers</h3>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-slate-500 sm:hidden">Transfers</span>
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
            {plan.transfers.singles.map(s => (
              <div key={`${s.out.id}-${s.in.id}`} className="flex items-center gap-2 text-xs rounded-lg px-3 py-1.5" style={panelStyle}>
                <span className="flex-1 min-w-0 truncate">
                  <span className="text-slate-400">{s.out.name}</span>
                  <span className="text-slate-600"> → </span>
                  <span className="text-slate-100 font-semibold">{s.in.name}</span>
                  <span className="text-slate-500"> · {TEAMS[s.in.team].short} · £{s.in.price.toFixed(1)}</span>
                </span>
                <span className="hidden sm:flex"><Fixtures games={plan.byPlayer.get(s.in.id).games.slice(0, HORIZON)} /></span>
                <span className="w-12 text-right tabular-nums text-emerald-400">{fmt(s.gain)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="text-sm font-bold text-slate-200 mt-6 mb-2">Dead weight</h3>
      <p className="text-[11px] text-slate-500 mb-2">Your four lowest projections over {roundsLabel}: first in line to go.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {deadWeight.map(p => (
          <div key={p.id} className="rounded-xl p-3 flex items-center gap-3" style={panelStyle}>
            <PlayerSide player={p} price={sellPrice(p, RULES.sellOnFee)} total={plan.horizonTotal(p)} games={plan.byPlayer.get(p.id).games.slice(0, HORIZON)} muted />
            <span className="text-[11px] text-slate-500 text-right max-w-[9rem]">
              {OUT.has(p.availability) ? <span className="text-red-400">{p.availability}</span> : p.chance != null && p.chance < 100 ? <span className="text-amber-400">{p.chance}% to play</span> : `${p.last4} pts in last 4`}
            </span>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-bold text-slate-200 mt-6 mb-2">Chips</h3>
      <div className="grid sm:grid-cols-2 gap-2">
        {RULES.chips.map((def, i) => <ChipCard key={`${def.name}-${i}`} def={def} plan={plan} />)}
      </div>

      <p className="text-[11px] text-slate-600 mt-4 leading-relaxed">
        Projections are the My team ones (form × fixture × chance of playing), scored as your best XI plus captain each round, so bench upgrades count for little.
        Sell prices include the {RULES.sellOnFee * 100}% sell-on fee. Free transfers are replayed from your history and checked against the hits you paid.
        Chip effects as fan guides describe them (the game's feed doesn't say):{' '}
        {[...new Set(RULES.chips.map(c => c.name))].filter(name => CHIPS[name]?.effect).map(name => `${CHIPS[name].label} ${CHIPS[name].effect}`).join(', ')}.
        Transfers you've already made for GW{ROUND} don't show until its deadline.
      </p>
    </div>
  )
}
