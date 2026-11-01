import { useState, useMemo } from 'react'
import { useFantasyData, perLeague } from '../contexts/fantasyData'
import { POSITIONS } from '../utils/fantasyPlayers'
import Chip from './FilterChip'

const derive = perLeague(data => {
  const PLAYERS = Object.fromEntries(data.players.map(p => [p.id, p]))
  const MY_PICKS = new Set((data.mySquad?.picks ?? []).map(p => p.id))
  const ENTRIES = data.topManagers?.entries ?? []
  // How many of the top managers own and captain each player.
  const owned = new Map()
  const captained = new Map()
  // Which of the top managers (by rank) own each player.
  const ownerRanks = new Map()
  for (const e of ENTRIES) {
    for (const id of e.picks) {
      owned.set(id, (owned.get(id) ?? 0) + 1)
      ownerRanks.set(id, [...(ownerRanks.get(id) ?? []), e.rank])
    }
    if (e.captain) captained.set(e.captain, (captained.get(e.captain) ?? 0) + 1)
  }
  // The user's players stay listed even when no top manager has them: those are the differentials.
  const ids = new Set([...owned.keys(), ...MY_PICKS])
  const ROWS = [...ids].filter(id => PLAYERS[id]).map(id => ({
    player: PLAYERS[id],
    owners: owned.get(id) ?? 0,
    topShare: ENTRIES.length ? ((owned.get(id) ?? 0) / ENTRIES.length) * 100 : 0,
    captains: captained.get(id) ?? 0,
    ranks: ownerRanks.get(id) ?? [],
    mine: MY_PICKS.has(id),
  }))
  return { TEAMS: Object.fromEntries(data.teams.map(t => [t.id, t])), PLAYERS, ENTRIES, ROWS }
})

const SHOW = {
  all:     { label: 'All' },
  missing: { label: 'Not in my team', test: r => !r.mine },
  mine:    { label: 'My team',        test: r => r.mine },
}

const pct = n => `${n.toFixed(n > 0 && n < 10 ? 1 : 0)}%`

// Owner ranks shown as badges in the table; the rest are in the tooltip.
const BADGE_RANKS = 10
const CHIP_NAMES = { wildcard: 'Wildcard', freehit: 'Free Hit', bboost: 'Bench Boost', '3xc': 'Triple Captain', rich: 'Rich Uncle', uteam: 'Unlimited Team', frush: 'Attack Attack', pdbus: 'Park the Bus', '2capt': 'Two Captains' }

// The top managers themselves: rank, points, captain, chip, a link to the
// team on the game's site, and a tap to show only that squad in the table.
function TopTeams({ selected, onSelect }) {
  const { data, league } = useFantasyData()
  const { ENTRIES, PLAYERS } = derive(data)
  const [all, setAll] = useState(false)
  const round = data.topManagers.round
  const list = all ? ENTRIES : ENTRIES.slice(0, 10)
  return (
    <section className="rounded-xl p-3 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <header className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-bold text-slate-100">Top teams</h3>
        <span className="text-[11px] text-slate-500">GW{round} squads · tap a team to see its players below · ↗ opens it on the game's site</span>
        <button onClick={() => setAll(v => !v)} className="ml-auto text-[11px] text-slate-400 hover:text-slate-200 whitespace-nowrap">{all ? 'Top 10' : `All ${ENTRIES.length}`}</button>
      </header>
      <div className="grid sm:grid-cols-2 gap-1">
        {list.map(e => {
          const active = selected === e.id
          return (
            <div key={e.id} className={`flex items-center gap-2 rounded-lg text-xs ${active ? 'bg-indigo-500/20 ring-1 ring-inset ring-indigo-400/50' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}>
              <button onClick={() => onSelect(active ? null : e.id)} className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 text-left">
                <span className="w-6 text-right font-bold tabular-nums text-slate-500">#{e.rank}</span>
                <span className="flex-1 min-w-0 truncate font-semibold text-slate-100">{e.name}</span>
                {e.chip && <span className="text-[10px] px-1.5 rounded bg-amber-400/15 text-amber-300 whitespace-nowrap">{CHIP_NAMES[e.chip] ?? e.chip}</span>}
                <span className="text-slate-500 truncate max-w-[6rem]" title="Captain">C: {PLAYERS[e.captain]?.shortName ?? '–'}</span>
                <span className="w-12 text-right tabular-nums text-slate-300">{e.total}</span>
              </button>
              {league.site && (
                <a
                  href={`${league.site}/entry/${e.id}/event/${round}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 text-slate-500 hover:text-indigo-300"
                  title={`Open ${e.name} on the game's site`}
                  aria-label={`Open ${e.name} on the game's site`}
                >
                  ↗
                </a>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function FantasyTopManagers() {
  const { data } = useFantasyData()
  const { TEAMS, ENTRIES } = derive(data)
  const [show, setShow] = useState('all')
  const [positions, setPositions] = useState(new Set())
  const [entryId, setEntryId] = useState(null)
  const entry = ENTRIES.find(e => e.id === entryId)

  const rows = useMemo(() => {
    const test = SHOW[show].test ?? (() => true)
    const picks = entryId ? new Set(derive(data).ENTRIES.find(e => e.id === entryId)?.picks) : null
    return derive(data).ROWS
      .filter(r => test(r) && (!positions.size || positions.has(r.player.position)) && (!picks || picks.has(r.player.id)))
      .sort((a, b) => (picks ? a.player.position - b.player.position : 0) || b.owners - a.owners || b.captains - a.captains || b.player.ownership - a.player.ownership)
  }, [data, show, positions, entryId])

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

      <TopTeams selected={entryId} onSelect={setEntryId} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
        <div className="flex gap-1">
          {Object.entries(SHOW).map(([key, { label }]) => <Chip key={key} active={show === key} onClick={() => setShow(key)}>{label}</Chip>)}
        </div>
        <div className="flex gap-1">
          {Object.entries(POSITIONS).map(([id, label]) => (
            <Chip key={id} active={positions.has(Number(id))} onClick={() => togglePosition(Number(id))}>{label}</Chip>
          ))}
        </div>
        {entry && (
          <button onClick={() => setEntryId(null)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-200 border border-indigo-400/40">
            #{entry.rank} {entry.name}'s squad ×
          </button>
        )}
        <span className="text-xs text-slate-600 ml-auto">
          {rows.length} players{chips > 0 && ` · ${chips} of the ${n} played a chip this round`}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        <b className="text-slate-400">Top {n}</b> share of the top {n} squads with the player · <b className="text-slate-400">All</b> share of every manager ·{' '}
        <b className="text-slate-400">Capt</b> how many of the top {n} captain them · <b className="text-slate-400">Top 10</b> which of the top 10 teams own them (hover for all {n})
      </p>

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
              <th className="text-right font-semibold px-2 py-2.5" title={`How many of the top ${n} managers captain this player`}>Capt</th>
              <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap" title="Ranks of the top 10 teams that own this player">Top 10</th>
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
                <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                  {entry?.captain === r.player.id ? <span className="text-amber-300 font-bold" title={`${entry.name}'s captain`}>C</span> : r.captains || ''}
                </td>
                <td className="px-3 py-2" title={r.ranks.length ? `Owned by #${r.ranks.join(', #')}` : undefined}>
                  <span className="flex gap-0.5">
                    {r.ranks.filter(rank => rank <= BADGE_RANKS).map(rank => (
                      <span key={rank} className={`min-w-5 px-1 rounded text-[10px] font-semibold text-center tabular-nums ${entry?.rank === rank ? 'bg-indigo-400 text-slate-900' : 'bg-white/10 text-slate-300'}`}>{rank}</span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="text-sm text-slate-600 text-center py-10">No players match these filters</p>}
      </div>
    </>
  )
}
