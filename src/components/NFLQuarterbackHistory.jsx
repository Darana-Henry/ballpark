import { useState, useEffect, useMemo } from 'react'
import { fetchCurrentStartingQBs, fetchNFLTeamRanks } from '../api/nfl'
import { NFL_TEAMS_BY_DIVISION, nflLogo } from '../constants/nflTeams'
import { QB_HISTORY, QB_HISTORY_START_YEAR, historySeasons } from '../data/nflQuarterbacks'
import LoadingSpinner from './LoadingSpinner'

// `Josh Allen(11)` / `Trevor Lawrence(2-8)` — the sheet tracks starts for most
// cells and a win-loss record for a few, so both render.
function qbSuffix(qb) {
  if (qb.starts != null) return `(${qb.starts})`
  if (qb.record) return `(${qb.record})`
  return ''
}

function HistoryCell({ quarterbacks }) {
  if (!quarterbacks?.length) return <span className="text-slate-700">—</span>
  return (
    <span className="text-slate-400">
      {quarterbacks.map((qb, i) => (
        <span key={`${qb.name}-${i}`}>
          {i > 0 && <span className="text-slate-700"> / </span>}
          <span className={i === 0 ? 'text-slate-300' : ''}>{qb.name}</span>
          <span className="text-slate-600 tabular-nums">{qbSuffix(qb)}</span>
        </span>
      ))}
    </span>
  )
}

function CurrentCell({ qb }) {
  if (!qb) return <span className="text-slate-700">—</span>
  return (
    <span className="flex items-center gap-2">
      {qb.photo
        ? <img src={qb.photo} alt="" width={22} height={22} className="rounded-full object-cover object-top bg-slate-800 shrink-0" />
        : <div className="w-[22px] h-[22px] rounded-full bg-slate-700 shrink-0" />
      }
      <span className="font-medium text-slate-100 truncate">{qb.name}</span>
    </span>
  )
}

export default function NFLQuarterbackHistory() {
  const [current, setCurrent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    const teams = NFL_TEAMS_BY_DIVISION.flatMap(d => d.teams)
    // Depth charts are keyed by ESPN's numeric team id, which the shared team
    // map doesn't carry — the standings call is what supplies it.
    fetchNFLTeamRanks()
      .then(({ teams: ranked }) => {
        const byAbbr = Object.fromEntries(ranked.map(t => [t.abbreviation, t.teamId]))
        return fetchCurrentStartingQBs(
          teams.map(t => ({ abbreviation: t.abbr, teamId: byAbbr[t.abbr] })).filter(t => t.teamId)
        )
      })
      .then(d => { if (!cancelled) setCurrent(d) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const seasons = useMemo(() => historySeasons(current?.season), [current?.season])
  const hasHistory = seasons.length > 0

  if (loading) return <LoadingSpinner message="Loading starting quarterbacks…" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xs text-slate-500">
          Starting quarterback by team{hasHistory ? `, ${QB_HISTORY_START_YEAR} to present` : ''} · all 32 teams
        </p>
        {current?.season && (
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">
            {current.season} read live from depth charts
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-3 text-red-400 text-xs">
          Current quarterbacks unavailable: {error}
        </div>
      )}

      {!hasHistory && (
        <div className="rounded-xl bg-amber-950/40 border border-amber-900/50 p-3 text-amber-300 text-xs">
          <span className="font-semibold">Past seasons not loaded.</span>{' '}
          Run <code className="bg-amber-900/40 px-1 rounded">npm run qb:fetch</code> to pull them from Wikipedia.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#1a1a28]">
              <th className="text-left font-semibold text-slate-400 text-xs uppercase tracking-wider px-3 py-2 sticky left-0 bg-[#1a1a28] z-10">Team</th>
              <th className="text-left font-semibold text-slate-500 text-xs uppercase tracking-wider px-3 py-2 whitespace-nowrap">
                {current?.season ?? 'Current'}
              </th>
              {seasons.map(year => (
                <th key={year} className="text-left font-semibold text-slate-500 text-xs uppercase tracking-wider px-3 py-2 whitespace-nowrap">
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NFL_TEAMS_BY_DIVISION.map(({ division, teams }) => (
              <DivisionRows key={division} division={division} colSpan={seasons.length + 2}>
                {teams.map(team => (
                  <tr key={team.abbr} className="border-t border-slate-800/60 hover:bg-slate-800/20">
                    <td className="px-3 py-2 sticky left-0 bg-[#161622] z-10">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <img src={nflLogo(team.abbr)} alt="" width={18} height={18} className="object-contain shrink-0" />
                        <span className="text-slate-200 font-medium">{team.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <CurrentCell qb={current?.byTeam?.[team.abbr]} />
                    </td>
                    {seasons.map(year => (
                      <td key={year} className="px-3 py-2 whitespace-nowrap text-xs">
                        <HistoryCell quarterbacks={QB_HISTORY[team.abbr]?.[year]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </DivisionRows>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// A division header row followed by that division's teams. Kept as its own
// component so the table body stays a flat list of rows.
function DivisionRows({ division, colSpan, children }) {
  return (
    <>
      <tr>
        <td colSpan={colSpan} className="px-3 py-1.5 bg-[#12121c] text-[10px] font-semibold uppercase tracking-widest text-slate-500 sticky left-0">
          {division}
        </td>
      </tr>
      {children}
    </>
  )
}
