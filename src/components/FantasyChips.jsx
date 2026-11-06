import { useState } from 'react'
import { useFantasyData } from '../contexts/fantasyData'
import { POSITIONS } from '../utils/fantasyPlayers'
import { derivePlan, chipPlan, chipBoostTransfers, squadLineup, CHIP_WINDOW } from '../utils/fantasyPlan'
import { CHIPS } from '../utils/fantasyPlanner'
import { SquadPitch } from './FantasySquadPitch'
import { InOutLists } from './FantasyIdealTeam'
import { SwapLine } from './FantasyPlanRows'
import { panelStyle, fmt, useGames, NEW_BADGE } from './fantasyPlanShared'

// The Chips sub-tab: when to play each chip over the next CHIP_WINDOW rounds
// (one chip a round), and with whom: the squad a wildcard, free hit or
// unlimited-budget chip would field, the players a boost chip scores through
// and the transfers that would make it worth more. See chipPlan.

const roundsOf = (from, count) => (count > 1 ? `GW${from}–${from + count - 1}` : `GW${from}`)

function Bars({ card }) {
  const max = Math.max(1, ...card.values.map(v => v.value))
  return (
    <div className="flex items-end gap-1 mt-2 h-12">
      {card.values.map(v => (
        <div key={v.round} className="flex-1 flex flex-col items-center gap-0.5" title={`GW${v.round}: ${fmt(v.value)} pts`}>
          <div
            className={`w-full rounded-t ${card.planned?.round === v.round ? 'bg-amber-400' : 'bg-indigo-400/60'}`}
            style={{ height: `${Math.max(2, (Math.max(0, v.value) / max) * 32)}px` }}
          />
          <span className={`text-[9px] ${card.planned?.round === v.round ? 'text-amber-300 font-bold' : 'text-slate-500'}`}>{v.round}</span>
        </div>
      ))}
    </div>
  )
}

function advice(card, cards, window) {
  const span = `GW${window[0].round}–${window.at(-1).round}`
  const v = card.planned
  const per = card.kind === 'rebuild' ? ` over ${roundsOf(v?.round ?? card.best.round, (v ?? card.best).count)}, beyond what your best normal transfers would add` : ''
  if (v) return `Play it in GW${v.round}: about ${fmt(v.value)} pts${per}.`
  const best = card.best
  if (best.value <= 0.5) return `Hold: it's worth little in ${span}.`
  if (!card.standsOut(best)) {
    return card.kind === 'rebuild'
      ? `Hold: the best rebuild (from GW${best.round}) adds only ${fmt(best.value)} pts${per}. Keep it for an injury crisis or a round with doubles.`
      : `Hold: no round in ${span} stands out (best GW${best.round}, ${fmt(best.value)} pts). Keep it for a double round or kinder fixtures.`
  }
  const rival = cards.find(c => c !== card && c.planned?.round === best.round)
  return `Hold: its best round, GW${best.round} (${fmt(best.value)} pts), does more for ${rival?.label ?? 'another chip'}.`
}

function SquadChoice({ card, v }) {
  const { data } = useFantasyData()
  const { plan, ROUND } = derivePlan(data)
  const [showPitch, setShowPitch] = useState(false)
  const mine = new Set(plan.squad.map(p => p.id))
  const now = new Set(v.squad.map(p => p.id))
  const ins = v.squad.filter(p => !mine.has(p.id)).sort((a, b) => a.position - b.position || b.price - a.price)
  const outs = plan.squad.filter(p => !now.has(p.id)).sort((a, b) => a.position - b.position || b.price - a.price)
  const from = v.round - ROUND
  return (
    <div className="mt-3">
      <p className="text-[11px] text-slate-400 mb-2">
        {card.kind === 'rebuild' ? 'The rebuild' : 'The one-round squad'} for {roundsOf(v.round, v.count)}
        {card.kind === 'unlimited' ? ' (no budget limit)' : ''}
        {card.kind !== 'rebuild' && ': your own squad comes back the round after'}.
      </p>
      <InOutLists squad={plan.squad} ins={ins} outs={outs} from={from} count={v.count} />
      <button onClick={() => setShowPitch(s => !s)} className="mt-2 text-[11px] text-slate-500 hover:text-slate-300">
        {showPitch ? 'Hide' : 'Show'} the squad on the pitch
      </button>
      {showPitch && (
        <div className="mt-2">
          <SquadPitch lineup={squadLineup(v.squad, plan.byPlayer, from, v.count, plan.common.scoring)} rounds={v.count} cardProps={p => ({ price: { now: p.price }, badge: mine.has(p.id) ? undefined : NEW_BADGE })} />
        </div>
      )}
    </div>
  )
}

function BoostChoice({ card, v }) {
  const { data } = useFantasyData()
  const { TEAMS } = derivePlan(data)
  const games = useGames()
  const transfers = chipBoostTransfers(data, card)
  const through = {
    '3xc': 'Captain', '2capt': 'Second captain', bboost: 'Your bench', pdbus: 'Your starting defenders', frush: 'Your starting forwards',
  }[card.def.name] ?? 'Through'
  return (
    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{through} in GW{v.round}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {v.players.map(p => (
          <span key={p.id} className="text-xs rounded-lg px-2 py-1 bg-white/5 text-slate-200" title={p.fullName}>
            <span className="text-slate-500">{POSITIONS[p.position]}</span> {p.shortName} <span className="text-slate-500">· {TEAMS[p.team].short}</span> <span className="tabular-nums text-amber-300">{p.projection.points.toFixed(1)}</span>
          </span>
        ))}
        {!v.players.length && <span className="text-xs text-slate-500">No one: nobody qualifies that round.</span>}
      </div>
      {transfers.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Transfers that make it worth more</p>
          <div className="flex flex-col gap-1">
            {transfers.map(s => <SwapLine key={`${s.out.id}-${s.in.id}`} swap={s} games={games(s.in)} />)}
          </div>
          <p className="text-[11px] text-slate-600 mt-1">Gain is the next 3 rounds plus the chip in GW{v.round}.</p>
        </>
      )}
    </div>
  )
}

function ChipCard({ card, cards, window }) {
  const { LAST } = derivePlan(useFantasyData().data)
  const { def } = card
  const span = def.start === 1 && def.stop >= LAST ? 'any round' : `GW${def.start}–${def.stop}`
  const v = card.planned ?? card.best
  const effect = CHIPS[def.name]?.effect
  return (
    <section className={`rounded-xl p-3 ring-1 ring-inset ${card.planned ? 'ring-amber-400/40' : 'ring-indigo-500/20'}`} style={panelStyle}>
      <p className="text-sm font-semibold text-slate-100">
        {card.label} <span className="text-[11px] font-normal text-slate-500">· {span}{effect ? ` · ${effect}` : ''}</span>
      </p>
      <p className="text-xs text-slate-300 mt-1">
        {card.opensLater && `Opens in GW${def.start}. `}
        {advice(card, cards, window)}
        {card.mustPlay && <span className="text-amber-300"> It expires after GW{def.stop}.</span>}
      </p>
      <Bars card={card} />
      {card.kind === 'boost' ? <BoostChoice card={card} v={v} /> : <SquadChoice key={v.round} card={card} v={v} />}
    </section>
  )
}

function Calendar({ cards, window }) {
  const open = cards.filter(c => c.status === 'open')
  return (
    <div className="rounded-xl p-3 mb-5" style={panelStyle}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Chip calendar · next {window.length} rounds</p>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${window.length}, minmax(0, 1fr))` }}>
        {window.map(r => {
          const chip = open.find(c => c.planned?.round === r.round)
          return (
            <div key={r.round} className={`rounded-lg px-1.5 py-2 text-center ${chip ? 'bg-amber-400/15 ring-1 ring-inset ring-amber-400/40' : 'bg-white/[0.03]'}`}>
              <p className="text-[10px] text-slate-500">GW{r.round}</p>
              <p className={`text-[11px] sm:text-xs font-semibold leading-tight mt-0.5 ${chip ? 'text-amber-200' : 'text-slate-600'}`}>{chip?.label ?? '—'}</p>
              {chip && <p className="text-[10px] tabular-nums text-amber-300/80">{fmt(chip.planned.value)}</p>}
            </div>
          )
        })}
      </div>
      {open.some(c => !c.planned) && (
        <p className="text-[11px] text-slate-500 mt-2">Hold: {open.filter(c => !c.planned).map(c => c.label).join(', ')}</p>
      )}
    </div>
  )
}

export default function FantasyChips() {
  const { data } = useFantasyData()
  const { SQUAD_INFO, RULES, ROUND, plan } = derivePlan(data)

  if (!plan) {
    return <p className="text-sm text-slate-500 text-center py-10">{SQUAD_INFO ? 'The season is over.' : 'Your squad couldn\'t be fetched yet.'}</p>
  }

  const { cards, window } = chipPlan(data)
  const open = cards.filter(c => c.status === 'open')
  const later = cards.filter(c => c.status === 'later' || c.status === 'unknown')
  const done = cards.filter(c => c.status === 'used' || c.status === 'expired')
  const windowLabel = `GW${window[0].round}–${window.at(-1).round}`

  return (
    <div className="max-w-4xl">
      {open.length ? <Calendar cards={cards} window={window} /> : (
        <p className="text-sm text-slate-500 mb-5">No chip can be played in {windowLabel}.</p>
      )}

      <div className="flex flex-col gap-3">
        {open.map(c => <ChipCard key={`${c.def.name}-${c.index}`} card={c} cards={open} window={window} />)}
      </div>

      {(later.length > 0 || done.length > 0) && (
        <div className="mt-5 grid sm:grid-cols-2 gap-2">
          {later.map(c => (
            <div key={`${c.def.name}-${c.index}`} className="rounded-xl p-3 opacity-70" style={panelStyle}>
              <p className="text-sm font-semibold text-slate-300">{c.label} <span className="text-[11px] font-normal text-slate-500">· GW{c.def.start}–{c.def.stop}</span></p>
              <p className="text-xs text-slate-500 mt-1">{c.status === 'unknown' ? 'No projection for this chip yet.' : `Opens in GW${c.def.start}, after the ${CHIP_WINDOW} rounds planned here.`}</p>
            </div>
          ))}
          {done.map(c => (
            <div key={`${c.def.name}-${c.index}`} className="rounded-xl p-3 opacity-50" style={panelStyle}>
              <p className="text-sm font-semibold text-slate-300">{c.label} <span className="text-[11px] font-normal text-slate-500">· GW{c.def.start}–{c.def.stop}</span></p>
              <p className="text-xs text-slate-500 mt-1">
                {c.status === 'used' ? `Used in GW${c.used.round} · scored ${SQUAD_INFO.points[c.used.round] ?? '–'} pts that round` : `Expired unused after GW${c.def.stop}`}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-600 mt-4 leading-relaxed">
        Each chip is valued round by round over {windowLabel} with your GW{ROUND - 1} squad, on the same projection as everywhere else (form × fixture × chance of playing): fixtures further out are too rough a guess to commit a chip to.
        The calendar puts each chip in its best round, one chip a round, and holds a chip whose best round doesn't clearly beat its others; a chip that expires inside the window is always placed.
        A Wildcard is weighed over the 3 rounds from when it's played, less what your best normal transfers would add anyway, and is only suggested at 10+ pts more.
        One-round squads and rebuilds stay within your budget (bank plus sell prices){RULES.chips.some(c => CHIPS[c.name]?.kind === 'unlimited') ? ', except an unlimited-budget chip' : ''}.
        Values don't yet account for transfers you make between now and the chip round, or for one chip changing another's squad.
      </p>
    </div>
  )
}
