import { useMemo, useState } from 'react'
import { NFL_TEAMS_BY_DIVISION, nflLogo } from '../constants/nflTeams'
import { buildSeasonGrid, FORM_STYLES, resultForTeam } from '../utils/teamForm'
import { getNFLPlayoffRound, weekId } from '../utils/nflWeeks'
import { getSeasonYear } from '../utils/season'
import { useWatched } from '../contexts/WatchedContext'
import EmptyState from './EmptyState'

function ResultCell({ result }) {
  // A fixture the user hasn't marked yet stays blank — the row fills in as
  // games are watched rather than revealing the season up front.
  if (result == null) {
    return <span className="inline-flex w-5 h-5 rounded border border-dashed border-slate-800" />
  }
  // Not in this playoff round.
  if (result === '-') {
    return <span className="inline-flex w-5 h-5 items-center justify-center text-slate-800 text-[10px]">·</span>
  }
  const style = FORM_STYLES[result] ?? FORM_STYLES.D
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${style.className}`}>
      {style.label}
    </span>
  )
}

const RESULT_TEXT = { W: 'text-emerald-400', L: 'text-red-400', D: 'text-slate-400' }

function weekLabel(game) {
  const id = weekId(game)
  if (id?.startsWith('po:')) return getNFLPlayoffRound(game.gameType, game.gameDate)
  return game.week != null ? `Week ${game.week}` : ''
}

/**
 * One team's whole season (regular season and any playoff games) in date
 * order. Scores show only for games the user has watched; a finished game they
 * haven't is marked as such without its result.
 */
function TeamSchedule({ team, teamId, games, onClose }) {
  const { watchedGames } = useWatched()

  const watchedById = useMemo(() => {
    const map = {}
    for (const r of Object.values(watchedGames ?? {})) {
      if (r.league === 'nfl' && r.watched) map[r.gameId] = r
    }
    return map
  }, [watchedGames])

  const schedule = useMemo(
    () => games
      .filter(g => (g.seasonType === 2 || g.seasonType === 3) &&
        (String(g.homeTeam.id) === String(teamId) || String(g.awayTeam.id) === String(teamId)))
      .sort((a, b) => a.gameDate - b.gameDate),
    [games, teamId]
  )

  const record = useMemo(() => {
    const r = { W: 0, L: 0, D: 0 }
    for (const g of schedule) {
      const res = watchedById[g.id] ? resultForTeam(watchedById[g.id], teamId) : null
      if (res) r[res]++
    }
    return r
  }, [schedule, watchedById, teamId])

  return (
    <div className="rounded-xl border border-slate-800 bg-[#161622] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1a1a28] border-b border-slate-800">
        <img src={nflLogo(team.abbr)} alt="" width={22} height={22} className="object-contain shrink-0" />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-100 truncate">{team.name}</span>
          <span className="text-[10px] text-slate-500 tabular-nums">
            Watched record {record.W}-{record.L}{record.D ? `-${record.D}` : ''}
          </span>
        </div>
        <button onClick={onClose} aria-label="Close schedule" className="text-slate-500 hover:text-slate-200 text-lg leading-none px-1">×</button>
      </div>

      {schedule.length === 0 && <p className="text-xs text-slate-500 p-3">No games on the schedule yet.</p>}

      <ul className="divide-y divide-slate-800/60">
        {schedule.map(g => {
          const home = String(g.homeTeam.id) === String(teamId)
          const opp = home ? g.awayTeam : g.homeTeam
          const rec = watchedById[g.id]
          const res = rec ? resultForTeam(rec, teamId) : null
          const own = rec ? (home ? rec.homeScore : rec.awayScore) : null
          const other = rec ? (home ? rec.awayScore : rec.homeScore) : null
          const playoff = g.seasonType === 3
          return (
            <li key={g.id} className={`flex items-center gap-2 px-3 py-2 ${playoff ? 'bg-amber-500/[0.04]' : ''}`}>
              <div className="flex flex-col w-20 shrink-0">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${playoff ? 'text-amber-400/80' : 'text-slate-500'}`}>{weekLabel(g)}</span>
                <span className="text-[10px] text-slate-600">
                  {g.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <span className="text-[10px] text-slate-600 w-4 shrink-0">{home ? 'vs' : '@'}</span>
              {opp.logo
                ? <img src={opp.logo} alt="" width={18} height={18} className="object-contain shrink-0" />
                : <span className="w-[18px] h-[18px] shrink-0" />}
              <span className="text-xs text-slate-300 flex-1 truncate">{opp.name}</span>
              {res ? (
                <span className={`text-xs font-bold tabular-nums shrink-0 ${RESULT_TEXT[res]}`}>
                  {res} {own}-{other}
                </span>
              ) : g.status === 'final' ? (
                <span className="text-[10px] text-slate-600 shrink-0">Not watched</span>
              ) : g.status === 'live' ? (
                <span className="text-[10px] font-semibold text-red-400 shrink-0">Live</span>
              ) : (
                <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                  {g.gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function NFLPerformanceHistory({ games, teamIdByAbbr, season }) {
  const { watchedGames } = useWatched()
  const [selected, setSelected] = useState(null)

  const { columns, rows } = useMemo(
    () => buildSeasonGrid(games ?? [], watchedGames ?? {}, teamIdByAbbr ?? {}, season),
    [games, watchedGames, teamIdByAbbr, season]
  )

  const seasonGames = useMemo(
    () => (games ?? []).filter(g => season == null || getSeasonYear('nfl', g.gameDate) === season),
    [games, season]
  )

  const divisions = useMemo(
    () => NFL_TEAMS_BY_DIVISION.map(d => ({
      ...d,
      teams: [...d.teams].sort((a, b) => a.name.localeCompare(b.name)),
    })),
    []
  )

  const selectedTeam = useMemo(
    () => (selected ? divisions.flatMap(d => d.teams).find(t => t.abbr === selected) : null),
    [selected, divisions]
  )

  const marked = useMemo(
    () => Object.values(rows).flat().filter(r => r === 'W' || r === 'L' || r === 'D').length,
    [rows]
  )

  if (!columns.length) {
    return <EmptyState emoji="🏈" title="No schedule yet" message="Week-by-week results appear once the season schedule loads." />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-xs text-slate-500">Week by week · grouped by division · click a team for its schedule</p>
        <span className="text-[10px] text-slate-600 uppercase tracking-wide">
          {marked} result{marked === 1 ? '' : 's'} from watched games · B = bye
        </span>
      </div>

      {marked === 0 && (
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 text-slate-400 text-xs">
          Nothing marked yet — each cell fills in once you mark that game watched.
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="overflow-x-auto rounded-xl border border-slate-800 max-w-full lg:flex-none">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-[#1a1a28]">
                <th className="text-left font-semibold text-slate-400 text-xs uppercase tracking-wider px-3 py-2 sticky left-0 bg-[#1a1a28] z-10">Team</th>
                {columns.map(c => (
                  <th key={c.id} className={`font-semibold text-[10px] uppercase tracking-wider px-1 py-2 ${c.playoff ? 'text-amber-400/70 w-9' : 'text-slate-500 w-7'}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {divisions.map(({ division, teams }) => (
                <DivisionRows key={division} division={division} colSpan={columns.length + 1}>
                  {teams.map(team => {
                    const active = selected === team.abbr
                    return (
                      <tr
                        key={team.abbr}
                        onClick={() => setSelected(active ? null : team.abbr)}
                        className={`border-t border-slate-800/60 cursor-pointer ${active ? 'bg-indigo-500/10' : 'hover:bg-slate-800/20'}`}
                      >
                        <td className={`px-3 py-1.5 sticky left-0 z-10 ${active ? 'bg-[#1c1c34]' : 'bg-[#161622]'}`}>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <img src={nflLogo(team.abbr)} alt="" width={16} height={16} className="object-contain shrink-0" />
                            <span className={active ? 'text-indigo-300 font-medium' : 'text-slate-200'}>{team.name}</span>
                          </span>
                        </td>
                        {(rows[team.abbr] ?? columns.map(() => null)).map((result, i) => (
                          <td key={columns[i].id} className="px-1 py-1.5 text-center">
                            <ResultCell result={result} />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </DivisionRows>
              ))}
            </tbody>
          </table>
        </div>

        {/* Team schedule: above the grid on phones, beside it on wide screens. */}
        <div className="order-first lg:order-none lg:flex-1 lg:min-w-[18rem] lg:max-w-md lg:sticky lg:top-4">
          {selectedTeam && teamIdByAbbr?.[selectedTeam.abbr] ? (
            <TeamSchedule
              team={selectedTeam}
              teamId={teamIdByAbbr[selectedTeam.abbr]}
              games={seasonGames}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="hidden lg:flex rounded-xl border border-dashed border-slate-800 p-4 text-xs text-slate-500">
              Click a team to see its full schedule, playoffs included, with scores for the games you’ve watched.
            </div>
          )}
        </div>
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
