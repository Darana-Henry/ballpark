import { useState, useMemo, Fragment } from 'react'
import { useFantasyData, useLabels, perLeague } from '../contexts/fantasyData'
import { POSITIONS } from '../utils/fantasyPlayers'
import { breakdown, GROUPS } from '../utils/fantasyActions'
import Chip from './FilterChip'
import { panelStyle } from './fantasyPlanShared'

// The Underlying sub-tab (the Bundesliga's, whose app scores every duel,
// pass and recovery): each player's points split into minutes, underlying
// actions and returns (goals, assists, clean sheets), per game played.
// "Repeatable" (minutes + underlying) is what they earn without a goal or
// clean sheet; per €m is that against the price, to find cheap players who
// pile up points through the week-in, week-out work. See fantasyActions.js.

const WINDOWS = {
  season: { label: 'Season', rounds: Infinity },
  last4:  { label: 'Last 4', rounds: 4 },
}

const PRICE_CAPS = [null, 10, 15, 20]

const COLUMNS = [
  { key: 'games', label: 'Games', title: 'Matchdays played in the window' },
  { key: 'perGame', label: 'Pts/g', title: 'Points per game played' },
  { key: 'underlyingPerGame', label: 'Underl./g', title: 'Underlying actions per game: duels, passes, recoveries, shots, saves, less fouls, cards and misplaced passes' },
  { key: 'returnsPerGame', label: 'Returns/g', title: "Goals, assists and the team's goals, clean sheets and goals conceded, per game" },
  { key: 'repeatablePerGame', label: 'Repeat./g', title: 'Minutes + underlying per game: the points before any goal, assist or clean sheet' },
  { key: 'repeatableShare', label: 'Repeat. %', title: 'Share of the points that came without a goal, assist or clean sheet' },
  { key: 'valuePerGame', label: 'per €m', title: 'Repeatable points per game for each million of price' },
]

const fmt = v => (v == null ? '–' : (Math.round(v) || 0).toLocaleString('en-US'))
// Points an action brings per game: a decimal below 10, signed.
const perGame = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v) < 9.95 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))}`

const derive = perLeague(data => ({
  TEAMS: Object.fromEntries(data.teams.map(t => [t.id, t])),
  MINE: new Set((data.mySquad?.picks ?? []).map(p => p.id)),
}))

// Minutes, underlying and returns side by side in one bar, scaled to `max`.
// A group that nets negative (more fouls and misplaced passes than work, say)
// takes no width; the numbers beside it still show it.
function SplitBar({ b, max, className = 'h-2.5' }) {
  return (
    <div className={`flex w-full rounded-sm overflow-hidden bg-white/5 ${className}`}>
      {['minutes', 'underlying', 'returns'].map(g => (
        <div key={g} className={GROUPS[g].color} style={{ width: `${(Math.max(0, b[`${g}PerGame`] ?? b[g]) / max) * 100}%` }} />
      ))}
    </div>
  )
}

function Detail({ player, b }) {
  const { R } = useLabels()
  const { data } = useFantasyData()
  const rounds = data.rounds.slice(-b.perRound.length)
  const max = Math.max(1, ...b.perRound.filter(Boolean).map(r => Math.max(0, r.minutes) + Math.max(0, r.underlying) + Math.max(0, r.returns)))
  const list = group => b.actions.filter(a => a.group === group && Math.abs(a.points) >= 0.5)
  return (
    <div className="grid md:grid-cols-[14rem_20rem_16rem] gap-6 px-3 py-3 text-xs sticky left-0 w-fit max-w-[calc(100vw-2rem)]">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Per matchday</p>
        <div className="flex items-end gap-1 h-24">
          {b.perRound.map((r, i) => (
            <div key={rounds[i]} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end" title={r ? `${R}${rounds[i]}: ${fmt(r.total)} pts (minutes ${fmt(r.minutes)}, underlying ${fmt(r.underlying)}, returns ${fmt(r.returns)})` : `${R}${rounds[i]}: not broken down`}>
              {r && r.played ? (
                <div className="w-full flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: `${((Math.max(0, r.minutes) + Math.max(0, r.underlying) + Math.max(0, r.returns)) / max) * 80}px` }}>
                  {['minutes', 'underlying', 'returns'].map(g => <div key={g} className={GROUPS[g].color} style={{ flex: Math.max(0, r[g]) }} />)}
                </div>
              ) : <span className="text-[9px] text-slate-600">{r ? '–' : '?'}</span>}
              <span className="text-[9px] text-slate-500">{rounds[i]}</span>
            </div>
          ))}
        </div>
      </div>
      {['underlying', 'returns'].map(group => (
        <div key={group}>
          <p className={`text-[10px] uppercase tracking-wider mb-2 ${GROUPS[group].text}`}>{GROUPS[group].label} · per game</p>
          <ul className="flex flex-col gap-0.5">
            {list(group).map(a => (
              <li key={a.name} className="flex gap-2 tabular-nums">
                <span className="truncate text-slate-300">{a.name}</span>
                <span className="ml-auto text-slate-500 shrink-0">{a.countPerGame.toFixed(1)}×</span>
                <span className={`w-12 text-right shrink-0 ${a.points < 0 ? 'text-red-300' : 'text-slate-100'}`}>{perGame(a.perGame)}</span>
              </li>
            ))}
            {!list(group).length && <li className="text-slate-600">None{group === 'returns' ? ` for ${player.shortName} yet` : ''}</li>}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function FantasyUnderlying() {
  const { data } = useFantasyData()
  const { C } = useLabels()
  const { TEAMS, MINE } = derive(data)
  const [windowKey, setWindowKey] = useState('season')
  const [positions, setPositions] = useState(new Set())
  const [regulars, setRegulars] = useState(true)
  const [priceCap, setPriceCap] = useState(null)
  const [sort, setSort] = useState({ key: 'repeatablePerGame', desc: true })
  const [open, setOpen] = useState(null)

  const windowSize = WINDOWS[windowKey].rounds
  const roundsInWindow = Math.min(windowSize, data.rounds.length)

  // Regulars played at least half the window's matchdays. The position
  // averages (green above, yellow price when also cheaper) are over them.
  const { rows, average, covered } = useMemo(() => {
    const all = data.players.map(p => ({ player: p, b: breakdown(p, data.actionTypes, windowSize) })).filter(r => r.b && r.b.games > 0)
    const isRegular = r => r.b.games >= Math.ceil(roundsInWindow / 2)
    const average = Object.fromEntries(Object.keys(POSITIONS).map(pos => {
      const group = all.filter(r => r.player.position === Number(pos) && isRegular(r))
      const mean = f => (group.length ? group.reduce((s, r) => s + f(r), 0) / group.length : null)
      return [pos, {
        count: group.length,
        price: mean(r => r.player.price),
        repeatable: mean(r => r.b.repeatablePerGame),
        minutes: mean(r => r.b.minutesPerGame),
        underlying: mean(r => r.b.underlyingPerGame),
        returns: mean(r => r.b.returnsPerGame),
      }]
    }))
    const rows = all.filter(r => (!regulars || isRegular(r))
      && (!positions.size || positions.has(r.player.position))
      && (priceCap == null || r.player.price <= priceCap))
    return { rows, average, covered: all.length }
  }, [data, windowSize, roundsInWindow, regulars, positions, priceCap])

  const sorted = [...rows].sort((a, b) => (sort.desc ? -1 : 1) * ((a.b[sort.key] ?? -Infinity) - (b.b[sort.key] ?? -Infinity)) || b.b.perGame - a.b.perGame)
  const max = Math.max(1, ...rows.map(r => Math.max(0, r.b.minutesPerGame) + Math.max(0, r.b.underlyingPerGame) + Math.max(0, r.b.returnsPerGame)))
  const posMax = Math.max(1, ...Object.values(average).map(a => (a.minutes ?? 0) + Math.max(0, a.underlying ?? 0) + Math.max(0, a.returns ?? 0)))
  const togglePosition = pos => setPositions(s => {
    const next = new Set(s)
    if (next.has(pos)) next.delete(pos)
    else next.add(pos)
    return next
  })
  const sortHeader = c => (
    <button onClick={() => setSort(s => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))} title={c.title} className={sort.key === c.key ? 'text-indigo-300' : 'hover:text-slate-300'}>
      {c.label === 'per €m' ? `per ${C}m` : c.label}{sort.key === c.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </button>
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1">
          {Object.entries(WINDOWS).map(([key, w]) => <Chip key={key} active={windowKey === key} onClick={() => setWindowKey(key)}>{w.label}</Chip>)}
        </div>
        <span className="w-px h-5 bg-white/10" />
        <div className="flex gap-1">
          {Object.entries(POSITIONS).map(([pos, label]) => <Chip key={pos} active={positions.has(Number(pos))} onClick={() => togglePosition(Number(pos))}>{label}</Chip>)}
        </div>
        <span className="w-px h-5 bg-white/10" />
        <div className="flex gap-1">
          {PRICE_CAPS.map(cap => <Chip key={cap ?? 'any'} active={priceCap === cap} onClick={() => setPriceCap(cap)}>{cap == null ? 'Any price' : `≤ ${C}${cap}`}</Chip>)}
        </div>
        <Chip active={regulars} onClick={() => setRegulars(r => !r)}>Regulars</Chip>
      </div>

      {/* Where each position's points come from: the average regular's game */}
      <section className="rounded-xl p-3 mb-4 max-w-3xl" style={panelStyle}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
          <h3 className="text-sm font-bold text-slate-100">Where the points come from</h3>
          <span className="text-[11px] text-slate-500">the average regular's game at each position</span>
          <span className="ml-auto flex gap-3 text-[11px]">
            {Object.entries(GROUPS).map(([g, v]) => <span key={g} className="flex items-center gap-1 text-slate-400"><span className={`w-2.5 h-2.5 rounded-sm ${v.color}`} />{v.label}</span>)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {Object.entries(POSITIONS).map(([pos, label]) => {
            const a = average[pos]
            if (!a.count) return null
            const total = a.minutes + a.underlying + a.returns
            return (
              <div key={pos} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 text-xs tabular-nums">
                <span className="text-slate-500 font-semibold">{label}</span>
                <div style={{ width: `${(total / posMax) * 100}%` }}><SplitBar b={a} max={total} className="h-3" /></div>
                <span className="text-slate-400 w-48 text-right whitespace-nowrap">
                  <span className="text-slate-100 font-semibold">{fmt(total)}</span> pts · {Math.round(((a.minutes + a.underlying) / total) * 100)}% repeatable · {C}{a.price.toFixed(1)}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="rounded-xl overflow-x-auto" style={panelStyle}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
              <th className="text-left font-semibold px-3 py-2.5">Pos</th>
              <th className="text-left font-semibold px-2 py-2.5">Player</th>
              <th className="text-right font-semibold px-2 py-2.5">{C}</th>
              <th className="text-left font-semibold px-2 py-2.5 min-w-32" title="Points per game: minutes, underlying, returns">Split / game</th>
              {COLUMNS.map(c => <th key={c.key} className="text-right font-semibold px-2 py-2.5 whitespace-nowrap">{sortHeader(c)}</th>)}
              <th className="text-left font-semibold px-3 py-2.5" title="The action bringing the most points per game">Top action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ player: p, b }) => {
              const avg = average[p.position]
              const above = avg.repeatable != null && b.repeatablePerGame > avg.repeatable
              const cheap = above && p.price < avg.price
              const top = b.actions.find(a => a.group === 'underlying' && a.points > 0)
              const isOpen = open === p.id
              return (
                <Fragment key={p.id}>
                  <tr onClick={() => setOpen(isOpen ? null : p.id)} className={`border-b border-white/5 cursor-pointer hover:bg-white/[0.03] ${isOpen ? 'bg-white/[0.04]' : ''}`}>
                    <td className="px-3 py-2 text-[11px] font-semibold text-slate-500">{POSITIONS[p.position]}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`font-semibold ${MINE.has(p.id) ? 'text-indigo-300' : 'text-slate-100'}`}>{p.name}</span>
                      <span className="text-[11px] text-slate-500"> · {TEAMS[p.team]?.short}</span>
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums ${cheap ? 'text-amber-300 font-semibold' : 'text-slate-400'}`} title={cheap ? 'Above the average regular at the position and cheaper than them' : undefined}>
                      {p.price.toFixed(1)}
                    </td>
                    <td className="px-2 py-2"><SplitBar b={b} max={max} /></td>
                    {COLUMNS.map(c => {
                      const v = b[c.key]
                      const text = c.key === 'repeatableShare' ? (v == null ? '–' : `${Math.round(v * 100)}%`) : c.key === 'valuePerGame' ? v?.toFixed(1) ?? '–' : c.key === 'games' ? v : fmt(v)
                      const tone = c.key === 'repeatablePerGame' && above ? 'text-emerald-400 font-semibold'
                        : sort.key === c.key ? 'text-slate-100 font-semibold' : 'text-slate-300'
                      return <td key={c.key} className={`px-2 py-2 text-right tabular-nums ${tone}`}>{text}</td>
                    })}
                    <td className="px-3 py-2 text-[11px] text-slate-400 whitespace-nowrap" title={top ? `${top.name}: ${top.countPerGame.toFixed(1)} a game, ${perGame(top.perGame)} pts` : undefined}>
                      {top ? <>{top.name} <span className="text-slate-500">{perGame(top.perGame)}</span></> : '–'}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <td colSpan={5 + COLUMNS.length}><Detail player={p} b={b} /></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!sorted.length && (
              <tr><td colSpan={5 + COLUMNS.length} className="px-3 py-8 text-center text-sm text-slate-500">No player fits these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-600 mt-3 leading-relaxed max-w-4xl">
        From the app's own points breakdown in your exports ({covered} of {data.players.length} players broken down so far; the rest appear once the export reads them). Tap a player for their matchdays and every action per game.
        Underlying is the work a player can repeat every week (duels, passes into the middle and final third, recoveries, interceptions, blocks, shots, saves) less fouls, cards, misplaced passes and lost duels; returns are goals, assists and the team's goals, clean sheets and goals conceded.
        Per-game figures count matchdays played. Regulars played at least half of the {roundsInWindow} matchdays; <span className="text-emerald-400">green</span> is above the average regular at the position, its price in <span className="text-amber-300">yellow</span> when also cheaper than them.
      </p>
    </>
  )
}
