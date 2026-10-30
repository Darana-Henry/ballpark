import { useState, useMemo } from 'react'
import data from '../data/eliteserienPlayers.json'
import { POSITIONS, availability } from '../utils/fantasyPlayers'
import { leagueTable } from '../utils/fantasyFixtures'
import Chip from './FilterChip'

// The sheet's "The Best Lads" tabs: each club's top scorer at every position,
// with the runner-up ("Second Best Lads") under it, over the season or the
// last 7 or 4 rounds (the windows used everywhere else here), clubs in league
// order. Below, the sheet's "Mean Ratio": the average best player per
// position across the clubs. Best players above that average show in green.

const LAST_ROUND = data.rounds.at(-1) ?? 0
const TABLE = leagueTable(data.fixtures, data.teams, LAST_ROUND)
const TEAMS = [...data.teams].sort((a, b) => (TABLE.get(a.id)?.rank ?? 99) - (TABLE.get(b.id)?.rank ?? 99))
const MY_PICKS = new Set((data.mySquad?.picks ?? []).map(p => p.id))
const PLAYERS = data.players.map(p => ({ ...p, availability: availability(p) }))

const WINDOWS = {
  season: { label: 'Season', rounds: Infinity },
  last7:  { label: 'Last 7', rounds: 7 },
  last4:  { label: 'Last 4', rounds: 4 },
}

const sumLast = (values, n) => values.slice(-Math.min(n, values.length)).reduce((sum, v) => sum + (v ?? 0), 0)

const STATUS_DOT = { doubtful: 'bg-amber-400', injured: 'bg-red-500', suspended: 'bg-red-500', unavailable: 'bg-slate-500' }

function PlayerLine({ entry, second, aboveAverage }) {
  if (!entry) return <p className={`text-xs text-slate-600 ${second ? 'pl-2' : ''}`}>–</p>
  const { player, points } = entry
  const mine = MY_PICKS.has(player.id)
  const dot = STATUS_DOT[player.availability]
  return (
    <div
      className={`flex items-center gap-1.5 min-w-0 ${second ? 'text-[11px] text-slate-500' : 'text-xs'}`}
      title={aboveAverage ? 'Above the average best player at this position' : undefined}
    >
      {/* Ownership wins the name colour; the points still show above-average */}
      <span className={`truncate ${second ? '' : 'font-semibold'} ${mine ? 'text-indigo-300' : aboveAverage ? 'text-emerald-400' : second ? '' : 'text-slate-100'}`} title={`${player.fullName}${mine ? ' · in your team' : ''}${player.news ? `\n${player.news}` : ''}`}>
        {player.name}
      </span>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} title={player.news ?? player.availability} />}
      <span className="ml-auto tabular-nums text-slate-500 shrink-0">£{player.price.toFixed(1)}</span>
      <span className={`w-8 text-right tabular-nums shrink-0 ${second ? '' : `font-bold ${aboveAverage ? 'text-emerald-400' : 'text-slate-100'}`}`}>{points}</span>
    </div>
  )
}

export default function EliteserienBestLads() {
  const [windowKey, setWindowKey] = useState('season')

  const { byTeam, benchmark } = useMemo(() => {
    const n = WINDOWS[windowKey].rounds
    // Ties go to more minutes in the window, then the cheaper player.
    const scored = PLAYERS.map(p => ({ player: p, points: sumLast(p.points, n), minutes: sumLast(p.minutes, n) }))
      .sort((a, b) => b.points - a.points || b.minutes - a.minutes || a.player.price - b.player.price)
    const byTeam = new Map(TEAMS.map(t => [t.id, Object.fromEntries(Object.keys(POSITIONS).map(pos => [pos, []]))]))
    for (const s of scored) {
      const slot = byTeam.get(s.player.team)?.[s.player.position]
      if (slot && slot.length < 2) slot.push(s)
    }
    const benchmark = Object.keys(POSITIONS).map(pos => {
      const best = TEAMS.map(t => byTeam.get(t.id)[pos][0]).filter(Boolean)
      const price = best.reduce((sum, b) => sum + b.player.price, 0) / best.length
      const top = [...best].sort((a, b) => b.points - a.points)[0]
      return { pos, points: best.reduce((sum, b) => sum + b.points, 0) / best.length, price, top }
    })
    return { byTeam, benchmark }
  }, [windowKey])
  const average = Object.fromEntries(benchmark.map(b => [b.pos, b.points]))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1">
          {Object.entries(WINDOWS).map(([key, w]) => <Chip key={key} active={windowKey === key} onClick={() => setWindowKey(key)}>{w.label}</Chip>)}
        </div>
        <span className="text-xs text-slate-600 ml-auto">
          Clubs in league order after GW{LAST_ROUND} · top scorer per position, runner-up below · <span className="text-indigo-300">your players</span> ·{' '}
          <span className="text-emerald-400">above average</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {TEAMS.map(t => {
          const row = TABLE.get(t.id)
          return (
            <section key={t.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <header className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-bold text-slate-500 tabular-nums w-5">{row?.rank}</span>
                <h3 className="text-sm font-bold text-slate-100 truncate">{t.name}</h3>
                <span className="ml-auto text-[11px] text-slate-500 tabular-nums">{row?.points} pts</span>
              </header>
              <div className="flex flex-col divide-y divide-white/5">
                {Object.entries(POSITIONS).map(([pos, label]) => {
                  const [best, second] = byTeam.get(t.id)[pos]
                  return (
                    <div key={pos} className="flex gap-2 py-1.5">
                      <span className="w-8 text-[10px] font-semibold text-slate-500 pt-0.5">{label}</span>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <PlayerLine entry={best} aboveAverage={best && best.points > average[pos]} />
                        <PlayerLine entry={second} second />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <section className="mt-5 rounded-xl p-3 max-w-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <h3 className="text-sm font-bold text-slate-100">Average best player</h3>
        <p className="text-[11px] text-slate-500 mb-2">Across the {TEAMS.length} clubs' top scorers: what a club's best player at each position usually scores and costs. Best players above the points average are in green in the cards. +25% is the sheet's price ceiling.</p>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-semibold py-1">Pos</th>
              <th className="text-right font-semibold py-1">Avg pts</th>
              <th className="text-right font-semibold py-1">Avg £</th>
              <th className="text-right font-semibold py-1">+25%</th>
              <th className="text-left font-semibold py-1 pl-4">Top of them</th>
            </tr>
          </thead>
          <tbody>
            {benchmark.map(b => (
              <tr key={b.pos} className="border-t border-white/5">
                <td className="py-1.5 text-slate-400">{POSITIONS[b.pos]}</td>
                <td className="py-1.5 text-right font-semibold text-slate-100">{b.points.toFixed(1)}</td>
                <td className="py-1.5 text-right text-slate-300">{b.price.toFixed(1)}</td>
                <td className="py-1.5 text-right text-slate-300">{(b.price * 1.25).toFixed(1)}</td>
                <td className="py-1.5 pl-4 text-slate-300 truncate">{b.top ? `${b.top.player.name} (${b.top.points})` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
