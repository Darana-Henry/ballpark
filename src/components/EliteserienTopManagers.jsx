import { useState, useMemo } from 'react'
import data from '../data/eliteserienPlayers.json'
import { POSITIONS } from '../utils/fantasyPlayers'
import Chip from './FilterChip'

const TEAMS = Object.fromEntries(data.teams.map(t => [t.id, t]))
const PLAYERS = Object.fromEntries(data.players.map(p => [p.id, p]))
const MY_PICKS = new Set((data.mySquad?.picks ?? []).map(p => p.id))
const ENTRIES = data.topManagers?.entries ?? []

// How many of the top managers own and captain each player.
const ROWS = (() => {
  const owned = new Map()
  const captained = new Map()
  for (const e of ENTRIES) {
    for (const id of e.picks) owned.set(id, (owned.get(id) ?? 0) + 1)
    if (e.captain) captained.set(e.captain, (captained.get(e.captain) ?? 0) + 1)
  }
  // The user's players stay listed even when no top manager has them: those are the differentials.
  const ids = new Set([...owned.keys(), ...MY_PICKS])
  return [...ids].filter(id => PLAYERS[id]).map(id => ({
    player: PLAYERS[id],
    owners: owned.get(id) ?? 0,
    topShare: ENTRIES.length ? ((owned.get(id) ?? 0) / ENTRIES.length) * 100 : 0,
    captains: captained.get(id) ?? 0,
    mine: MY_PICKS.has(id),
  }))
})()

const SHOW = {
  all:     { label: 'All' },
  missing: { label: 'Not in my team', test: r => !r.mine },
  mine:    { label: 'My team',        test: r => r.mine },
}

const pct = n => `${n.toFixed(n > 0 && n < 10 ? 1 : 0)}%`

export default function EliteserienTopManagers() {
  const [show, setShow] = useState('all')
  const [positions, setPositions] = useState(new Set())

  const rows = useMemo(() => {
    const test = SHOW[show].test ?? (() => true)
    return ROWS
      .filter(r => test(r) && (!positions.size || positions.has(r.player.position)))
      .sort((a, b) => b.owners - a.owners || b.captains - a.captains || b.player.ownership - a.player.ownership)
  }, [show, positions])

  if (!ENTRIES.length) {
    return <p className="text-sm text-slate-500 text-center py-10">Top managers' squads couldn't be fetched yet.</p>
  }

  const n = ENTRIES.length
  const chips = ENTRIES.filter(e => e.chip).length
  const cutoff = ENTRIES.at(-1)
  const togglePosition = id => setPositions(s => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          ['Top', `${n} overall`, `squads for GW${data.topManagers.round}`],
          ['#1', `${ENTRIES[0].total} pts`, ENTRIES[0].name],
          [`#${cutoff.rank}`, `${cutoff.total} pts`, 'top-50 cut-off'],
          ...(data.mySquad?.rank ? [[`You · #${data.mySquad.rank.toLocaleString('en-US')}`, `${data.mySquad.total} pts`, `${cutoff.total - data.mySquad.total} behind the top 50`]] : []),
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-base font-bold text-slate-100 tabular-nums">{value}</p>
            <p className="text-[11px] text-slate-500 truncate" title={note}>{note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <div className="flex gap-1">
          {Object.entries(SHOW).map(([key, { label }]) => <Chip key={key} active={show === key} onClick={() => setShow(key)}>{label}</Chip>)}
        </div>
        <div className="flex gap-1">
          {Object.entries(POSITIONS).map(([id, label]) => (
            <Chip key={id} active={positions.has(Number(id))} onClick={() => togglePosition(Number(id))}>{label}</Chip>
          ))}
        </div>
        <span className="text-xs text-slate-600 ml-auto">
          {rows.length} players{chips > 0 && ` · ${chips} of the ${n} played a chip this round`}
        </span>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
              <th className="text-left font-semibold px-3 py-2.5">Pos</th>
              <th className="text-left font-semibold px-2 py-2.5">Player</th>
              <th className="hidden sm:table-cell text-left font-semibold px-2 py-2.5">Team</th>
              <th className="text-right font-semibold px-2 py-2.5">£</th>
              <th className="text-right font-semibold px-2 py-2.5 whitespace-nowrap" title={`Share of the top ${n} who own this player`}>Top {n}</th>
              <th className="text-right font-semibold px-2 py-2.5 whitespace-nowrap" title="Share of all managers who own this player">All</th>
              <th className="text-right font-semibold px-3 py-2.5" title={`Top ${n} managers captaining this player`}>C</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.player.id} className={`border-b border-white/5 ${r.mine ? 'bg-indigo-500/[0.09]' : ''}`}>
                <td className={`px-3 py-2 text-xs text-slate-400 ${r.mine ? 'shadow-[inset_3px_0_0_#6366f1]' : ''}`}>{POSITIONS[r.player.position]}</td>
                <td className="px-2 py-2">
                  <span className="block font-semibold text-slate-100 whitespace-nowrap" title={r.player.fullName}>{r.player.name}</span>
                  {/* The team column gives way on phones so the ownership columns fit */}
                  <span className="sm:hidden block text-[11px] text-slate-500">{TEAMS[r.player.team]?.name}</span>
                </td>
                <td className="hidden sm:table-cell px-2 py-2 text-xs text-slate-400 whitespace-nowrap">{TEAMS[r.player.team]?.name}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-300">{r.player.price.toFixed(1)}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="hidden sm:block w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <span className="block h-full bg-indigo-400" style={{ width: `${r.topShare}%` }} />
                    </span>
                    <span className={`font-semibold ${r.owners ? 'text-slate-100' : 'text-slate-600'}`} title={`${r.owners} of ${n}`}>{pct(r.topShare)}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-400">{pct(r.player.ownership)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">{r.captains || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="text-sm text-slate-600 text-center py-10">No players match these filters</p>}
      </div>
    </>
  )
}
