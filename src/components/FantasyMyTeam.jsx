import { useMemo } from 'react'
import { useFantasyData, perLeague } from '../contexts/fantasyData'
import { withForm, availability } from '../utils/fantasyPlayers'
import { upcomingFixtures, DIFFICULTY } from '../utils/fantasyFixtures'
import { projectPoints, pickLineup } from '../utils/fantasyLineup'

const derive = perLeague(data => ({
  TEAMS: Object.fromEntries(data.teams.map(t => [t.id, t])),
  PICKS: data.mySquad?.picks ?? [],
  // Suggestions are for the round after the squad's: the next deadline.
  ROUND: (data.mySquad?.round ?? 0) + 1,
  LAST: Math.max(...data.fixtures.map(f => f.round ?? 0)),
}))
const ROWS = [1, 2, 3, 4]

const STATUS_SHIRT = {
  injured: '#ef4444',
  suspended: '#ef4444',
  unavailable: '#64748b',
  doubtful: '#f59e0b',
}

function Shirt({ color }) {
  return (
    <svg viewBox="0 0 40 38" className="w-9 h-9 sm:w-11 sm:h-11 drop-shadow" aria-hidden="true">
      <path d="M8 4 L15 1.5 Q20 6 25 1.5 L32 4 L39 12 L33 17 L32 15.5 L32 37 L8 37 L8 15.5 L7 17 L1 12 Z" fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
    </svg>
  )
}

function PlayerCard({ player, captain, vice, change }) {
  const { TEAMS } = derive(useFantasyData().data)
  const { projection, games } = player
  const shirt = STATUS_SHIRT[player.availability] ?? '#6366f1'
  const fixture = games.length
    ? games.map(g => `${TEAMS[g.opponent].short} (${g.home ? 'H' : 'A'})`).join(' + ')
    : 'No game'
  const hint = [
    `${player.fullName} · ${TEAMS[player.team].name}`,
    `Form ${projection.form.toFixed(1)} pts per round × fixture ${projection.fixture.toFixed(2)} × fitness ${Math.round(projection.fitness * 100)}%`,
    player.news,
  ].filter(Boolean).join('\n')
  return (
    <div className="relative flex flex-col items-center w-[4.25rem] sm:w-24" title={hint}>
      <div className="relative">
        <Shirt color={shirt} />
        {(captain || vice) && (
          <span className={`absolute -top-1 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center border ${captain ? 'bg-amber-400 text-slate-900 border-amber-200' : 'bg-slate-200 text-slate-900 border-white'}`}>
            {captain ? 'C' : 'V'}
          </span>
        )}
        {change && (
          <span className={`absolute -top-1 -left-2 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${change === 'in' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`} title={change === 'in' ? 'Start (benched last round)' : 'Bench (started last round)'}>
            {change === 'in' ? '↑' : '↓'}
          </span>
        )}
      </div>
      <div className="w-full mt-0.5 rounded-t-md bg-slate-950/90 px-1 py-0.5 text-center">
        <p className="text-[10px] sm:text-xs font-semibold text-slate-100 truncate">{player.shortName}</p>
      </div>
      <div className={`w-full px-1 py-0.5 text-center text-[9px] sm:text-[10px] font-semibold truncate ${games.length ? DIFFICULTY[Math.round(games.reduce((s, g) => s + g.difficulty, 0) / games.length)].className : 'bg-slate-800 text-slate-400'}`}>
        {fixture}
      </div>
      <div className="w-full rounded-b-md bg-white/90 px-1 py-0.5 text-center text-[10px] sm:text-xs font-bold text-slate-900 tabular-nums">
        {projection.points.toFixed(1)}
      </div>
    </div>
  )
}

// Pitch markings: halfway line and centre circle at the top (the attacking
// end is up), penalty box at the keeper's end.
function Pitch({ children }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-emerald-900/60 py-4 sm:py-6"
      style={{ background: 'repeating-linear-gradient(180deg, #166534 0 48px, #15803d 48px 96px)' }}
    >
      <div className="absolute inset-3 border-2 border-white/25 rounded-sm pointer-events-none" />
      <div className="absolute left-1/2 top-3 -translate-x-1/2 -translate-y-1/2 w-28 h-28 sm:w-36 sm:h-36 rounded-full border-2 border-white/25 pointer-events-none" />
      <div className="absolute left-1/2 bottom-3 -translate-x-1/2 w-1/2 h-20 sm:h-24 border-2 border-b-0 border-white/25 pointer-events-none" />
      <div className="absolute left-1/2 bottom-3 -translate-x-1/2 w-1/4 h-8 sm:h-10 border-2 border-b-0 border-white/25 pointer-events-none" />
      <div className="relative flex flex-col gap-4 sm:gap-6">{children}</div>
    </div>
  )
}

export default function FantasyMyTeam() {
  const { data } = useFantasyData()
  const { PICKS, ROUND } = derive(data)
  const plan = useMemo(() => {
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

  if (!plan) {
    return <p className="text-sm text-slate-500 text-center py-10">{PICKS.length ? 'The season is over.' : 'Your squad couldn\'t be fetched yet.'}</p>
  }

  const { starters, bench, captain, vice, formation } = plan
  const startingIds = new Set(starters.map(p => p.id))
  // Against the lineup the user actually fielded last round.
  const changeOf = p => (startingIds.has(p.id) ? (p.pick.bench ? 'in' : null) : (p.pick.bench ? null : 'out'))
  const total = starters.reduce((sum, p) => sum + p.projection.points, 0) + (captain?.projection.points ?? 0)
  const moves = starters.filter(p => p.pick.bench).length
  const lastCaptain = plan.squad.find(p => p.pick.captain)
  const card = p => <PlayerCard key={p.id} player={p} captain={p === captain} vice={p === vice} change={changeOf(p)} />

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          ['Gameweek', `GW${ROUND}`, `from your GW${data.mySquad.round} squad`],
          ['Formation', formation, 'best projected XI'],
          ['Projected', `${total.toFixed(1)} pts`, 'captain counted twice'],
          ['Captain', captain?.shortName ?? '–', `vice ${vice?.shortName ?? '–'}`],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-base font-bold text-slate-100 truncate">{value}</p>
            <p className="text-[11px] text-slate-500 truncate">{note}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mb-3">
        {moves ? `${moves} change${moves > 1 ? 's' : ''} from your GW${data.mySquad.round} lineup (↑ start, ↓ bench)` : `Same XI as your GW${data.mySquad.round} lineup`}
        {lastCaptain && captain && lastCaptain.id !== captain.id ? ` · captain moves from ${lastCaptain.shortName} to ${captain.shortName}` : ''}.
      </p>

      <Pitch>
        {/* Forwards at the top, keeper at the bottom */}
        {[...ROWS].reverse().map(pos => (
          <div key={pos} className="flex justify-evenly px-1">
            {starters.filter(p => p.position === pos).map(card)}
          </div>
        ))}
      </Pitch>

      <div className="mt-3 rounded-2xl px-2 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 px-1 mb-2">Bench · in order</p>
        <div className="flex justify-evenly">
          {bench.map((p, i) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{i === 0 && p.position === 1 ? 'GK' : i}</span>
              {card(p)}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">
        The white number is projected points: form (points per round, mostly the last 4) × fixture (easier opponents score more, double rounds count twice) × chance of playing.
        Hover a player for the breakdown. Built from the squad the game shows publicly, so transfers you've made since GW{data.mySquad.round} won't appear until that round's deadline passes.
      </p>
    </div>
  )
}
