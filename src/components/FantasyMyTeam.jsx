import { useEffect, useMemo, useRef, useState } from 'react'
import { useFantasyData, perLeague } from '../contexts/fantasyData'
import { withForm, availability } from '../utils/fantasyPlayers'
import { upcomingFixtures } from '../utils/fantasyFixtures'
import { projectPoints, pickLineup } from '../utils/fantasyLineup'
import { derivePlan } from '../utils/fantasyPlan'
import { replacementsFor, sellPrice } from '../utils/fantasyPlanner'
import { SquadPitch, WithSidePanel } from './FantasySquadPitch'
import { SwapLine } from './FantasyPlanRows'
import { panelStyle, useGames, scrollIntoViewOnPhone } from './fantasyPlanShared'

const derive = perLeague(data => ({
  PICKS: data.mySquad?.picks ?? [],
  // Suggestions are for the round after the squad's: the next deadline.
  ROUND: (data.mySquad?.round ?? 0) + 1,
  LAST: Math.max(...data.fixtures.map(f => f.round ?? 0)),
}))

const CHANGE_BADGE = {
  in: { text: '↑', className: 'bg-emerald-500 text-white', title: 'Start (benched last round)' },
  out: { text: '↓', className: 'bg-red-500 text-white', title: 'Bench (started last round)' },
}

// Tapping a player on the pitch: the best players to swap them for, in
// budget and within the club limit, by gain over the next 3 rounds.
function Replacements({ player, onClose }) {
  const { data } = useFantasyData()
  const { plan, RULES, SQUAD_INFO, ROUND, HORIZON } = derivePlan(data)
  const games = useGames()
  const owned = plan.squad.find(p => p.id === player.id)
  const options = owned ? replacementsFor(owned, { ...plan.common, horizon: HORIZON }, 5) : []
  const sale = sellPrice(owned ?? player, RULES.sellOnFee)
  const rounds = HORIZON > 1 ? `GW${ROUND}–${ROUND + HORIZON - 1}` : `GW${ROUND}`
  // On a phone the list opens below the bench, out of sight of a forward's card.
  const ref = useRef(null)
  useEffect(() => scrollIntoViewOnPhone(ref.current), [])
  return (
    <section ref={ref} className="rounded-2xl p-3 scroll-mb-24" style={panelStyle}>
      <header className="flex items-baseline gap-2 mb-1">
        <h3 className="text-sm font-bold text-slate-100">Replace {player.name}</h3>
        <button onClick={onClose} className="ml-auto text-[11px] text-slate-500 hover:text-slate-300">Close</button>
      </header>
      <p className="text-[11px] text-slate-500 mb-2">
        Sells for £{sale.toFixed(1)}m · up to £{(sale + SQUAD_INFO.bank).toFixed(1)}m to spend · gain in projected pts over {rounds} (your best XI + captain)
      </p>
      {options.length ? (
        <div className="flex flex-col gap-1">
          {options.map(o => <SwapLine key={o.in.id} swap={o} games={games(o.in)} showOut={false} />)}
        </div>
      ) : (
        <p className="text-xs text-slate-500 py-2">No one in budget at this position: they'd need £{(sale + SQUAD_INFO.bank).toFixed(1)}m or less and a club you have fewer than {RULES.squadTeamLimit} players from.</p>
      )}
      {options.length > 0 && options[0].gain < 0.05 && (
        <p className="text-[11px] text-slate-500 mt-2">No replacement beats keeping this player over {rounds}.</p>
      )}
    </section>
  )
}

export default function FantasyMyTeam() {
  const { data } = useFantasyData()
  const { PICKS, ROUND } = derive(data)
  const [selected, setSelected] = useState(null)
  const lineup = useMemo(() => {
    const { PICKS, ROUND, LAST } = derive(data)
    if (!PICKS.length || ROUND > LAST) return null
    const { byTeam } = upcomingFixtures(data.fixtures, data.teams, ROUND, 1)
    const squad = PICKS.flatMap(pick => {
      const p = data.players.find(x => x.id === pick.id)
      if (!p) return []
      const player = { ...withForm(p), availability: availability(p), pick }
      const games = byTeam.get(p.team)?.[0] ?? []
      return [{ ...player, games, projection: projectPoints(player, games) }]
    })
    return { squad, ...pickLineup(squad) }
  }, [data])

  if (!lineup) {
    return <p className="text-sm text-slate-500 text-center py-10">{PICKS.length ? 'The season is over.' : 'Your squad couldn\'t be fetched yet.'}</p>
  }

  const { starters, captain, vice, formation } = lineup
  const startingIds = new Set(starters.map(p => p.id))
  // Against the lineup the user actually fielded last round.
  const changeOf = p => (startingIds.has(p.id) ? (p.pick.bench ? 'in' : null) : (p.pick.bench ? null : 'out'))
  const total = starters.reduce((sum, p) => sum + p.projection.points, 0) + (captain?.projection.points ?? 0)
  const moves = starters.filter(p => p.pick.bench).length
  const lastCaptain = lineup.squad.find(p => p.pick.captain)
  const canReplace = Boolean(derivePlan(data).plan)

  return (
    <div className="max-w-3xl lg:max-w-none">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          ['Gameweek', `GW${ROUND}`, `from your GW${data.mySquad.round} squad`],
          ['Formation', formation, 'best projected XI'],
          ['Projected', `${total.toFixed(1)} pts`, 'captain counted twice'],
          ['Captain', captain?.shortName ?? '–', `vice ${vice?.shortName ?? '–'}`],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl px-3 py-2" style={panelStyle}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-base font-bold text-slate-100 truncate">{value}</p>
            <p className="text-[11px] text-slate-500 truncate">{note}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mb-3">
        {moves ? `${moves} change${moves > 1 ? 's' : ''} from your GW${data.mySquad.round} lineup (↑ start, ↓ bench)` : `Same XI as your GW${data.mySquad.round} lineup`}
        {lastCaptain && captain && lastCaptain.id !== captain.id ? ` · captain moves from ${lastCaptain.shortName} to ${captain.shortName}` : ''}.
        {canReplace && <span className="text-slate-500"> Tap a player for their best replacements.</span>}
      </p>

      <WithSidePanel
        side={selected && <Replacements key={selected.id} player={selected} onClose={() => setSelected(null)} />}
        hint={canReplace ? 'Tap a player on the pitch to see their best replacements here.' : null}
      >
        <SquadPitch
          lineup={lineup}
          cardProps={p => ({
            badge: CHANGE_BADGE[changeOf(p)],
            selected: selected?.id === p.id,
            onClick: canReplace ? () => setSelected(s => (s?.id === p.id ? null : p)) : undefined,
          })}
        />
      </WithSidePanel>

      <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">
        The white number is projected points: form (points per round, mostly the last 4) × fixture (easier opponents score more, double rounds count twice) × chance of playing.
        Hover a player for the breakdown. Built from the squad the game shows publicly, so transfers you've made since GW{data.mySquad.round} won't appear until that round's deadline passes.
      </p>
    </div>
  )
}
