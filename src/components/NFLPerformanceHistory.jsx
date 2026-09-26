import { useMemo } from 'react'
import { NFL_TEAMS_BY_DIVISION, nflLogo } from '../constants/nflTeams'
import { buildSeasonGrid, FORM_STYLES } from '../utils/teamForm'
import { useWatched } from '../contexts/WatchedContext'
import EmptyState from './EmptyState'

function ResultCell({ result }) {
  // A fixture the user hasn't marked yet stays blank — the row fills in as
  // games are watched rather than revealing the season up front.
  if (result == null) {
    return <span className="inline-flex w-5 h-5 rounded border border-dashed border-slate-800" />
  }
  const style = FORM_STYLES[result] ?? FORM_STYLES.D
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${style.className}`}>
      {style.label}
    </span>
  )
}

export default function NFLPerformanceHistory({ games, teamIdByAbbr, season }) {
  const { watchedGames } = useWatched()

  const { weeks, rows } = useMemo(
    () => buildSeasonGrid(games ?? [], watchedGames ?? {}, teamIdByAbbr ?? {}, season),
    [games, watchedGames, teamIdByAbbr, season]
  )

  const divisions = useMemo(
    () => NFL_TEAMS_BY_DIVISION.map(d => ({
      ...d,
      teams: [...d.teams].sort((a, b) => a.name.localeCompare(b.name)),
    })),
    []
  )

  const marked = useMemo(
    () => Object.values(rows).flat().filter(r => r === 'W' || r === 'L' || r === 'D').length,
    [rows]
  )

  if (!weeks.length) {
    return <EmptyState emoji="🏈" title="No schedule yet" message="Week-by-week results appear once the season schedule loads." />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-xs text-slate-500">Week by week · grouped by division</p>
        <span className="text-[10px] text-slate-600 uppercase tracking-wide">
          {marked} result{marked === 1 ? '' : 's'} from watched games · B = bye
        </span>
      </div>

      {marked === 0 && (
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 text-slate-400 text-xs">
          Nothing marked yet — each cell fills in once you mark that game watched.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="bg-[#1a1a28]">
              <th className="text-left font-semibold text-slate-400 text-xs uppercase tracking-wider px-3 py-2 sticky left-0 bg-[#1a1a28] z-10">Team</th>
              {weeks.map(w => (
                <th key={w} className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider px-1 py-2 w-7">{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {divisions.map(({ division, teams }) => (
              <DivisionRows key={division} division={division} colSpan={weeks.length + 1}>
                {teams.map(team => (
                  <tr key={team.abbr} className="border-t border-slate-800/60 hover:bg-slate-800/20">
                    <td className="px-3 py-1.5 sticky left-0 bg-[#161622] z-10">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <img src={nflLogo(team.abbr)} alt="" width={16} height={16} className="object-contain shrink-0" />
                        <span className="text-slate-200">{team.name}</span>
                      </span>
                    </td>
                    {(rows[team.abbr] ?? weeks.map(() => null)).map((result, i) => (
                      <td key={weeks[i]} className="px-1 py-1.5 text-center">
                        <ResultCell result={result} />
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
