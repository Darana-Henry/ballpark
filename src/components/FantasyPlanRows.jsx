import { useFantasyData } from '../contexts/fantasyData'
import { POSITIONS } from '../utils/fantasyPlayers'
import { DIFFICULTY } from '../utils/fantasyFixtures'
import { derivePlan } from '../utils/fantasyPlan'
import { panelStyle, fmt } from './fantasyPlanShared'

// Rows the planning panels share: a fixture ticker, one side of a transfer,
// and a compact "out → in" swap line.

/** One chip per round, two for a double, a dash for a blank. */
export function Fixtures({ games }) {
  const { TEAMS } = derivePlan(useFantasyData().data)
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

export function PlayerSide({ player, price, total, games, muted }) {
  const { TEAMS } = derivePlan(useFantasyData().data)
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

/** "Out → In · club · £ · fixtures · gain" on one line. */
export function SwapLine({ swap, games, showOut = true }) {
  const { TEAMS } = derivePlan(useFantasyData().data)
  return (
    <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-1.5" style={panelStyle}>
      <span className="flex-1 min-w-0 truncate">
        {showOut && <><span className="text-slate-400">{swap.out.name}</span><span className="text-slate-600"> → </span></>}
        <span className="text-slate-100 font-semibold">{swap.in.name}</span>
        <span className="text-slate-500"> · {TEAMS[swap.in.team].short} · £{swap.in.price.toFixed(1)}</span>
      </span>
      {games && <span className="hidden sm:flex"><Fixtures games={games} /></span>}
      {swap.gain != null && <span className={`w-12 text-right tabular-nums ${swap.gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(swap.gain)}</span>}
    </div>
  )
}
