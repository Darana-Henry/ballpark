import { useState, useEffect } from 'react'
import { fetchNFLLeagueLeaders } from '../api/nfl'
import { nflLogo } from '../constants/nflTeams'
import LoadingSpinner from './LoadingSpinner'
import EmptyState from './EmptyState'

function LeaderRow({ player, rank, unit, teamAbbrById }) {
  const abbr = teamAbbrById?.[player.teamId]
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${rank > 1 ? 'border-t border-slate-800/60' : ''} ${rank % 2 ? 'bg-[#161622]' : 'bg-[#131320]'}`}>
      <span className={`text-xs font-bold tabular-nums w-4 shrink-0 ${rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-600' : 'text-slate-600'}`}>
        {rank}
      </span>
      {player.photo
        ? <img src={player.photo} alt="" width={28} height={28} className="rounded-full object-cover object-top bg-slate-800 shrink-0" />
        : <div className="w-7 h-7 rounded-full bg-slate-700 shrink-0" />
      }
      <span className="text-sm font-medium text-slate-200 flex-1 truncate">{player.name}</span>
      {abbr && <img src={nflLogo(abbr)} alt={abbr} width={16} height={16} className="object-contain shrink-0 opacity-80" />}
      <span className="text-xs text-slate-500 shrink-0 w-9">{abbr ?? ''}</span>
      <span className="text-sm font-bold tabular-nums text-slate-100 shrink-0">
        {player.display}{unit}
      </span>
    </div>
  )
}

function Board({ board, teamAbbrById }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest shrink-0">{board.title}</h3>
        {board.note && <span className="text-[10px] text-slate-600 uppercase tracking-wide shrink-0">{board.note}</span>}
        <div className="flex-1 border-t border-slate-800" />
      </div>
      {board.players.length === 0
        ? <p className="text-xs text-slate-600 px-3 py-4 rounded-xl border border-slate-800">No qualifying players yet this season.</p>
        : (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            {board.players.map((p, i) => (
              <LeaderRow key={p.id} player={p} rank={i + 1} unit={board.unit} teamAbbrById={teamAbbrById} />
            ))}
          </div>
        )}
    </section>
  )
}

// League-wide statistical leaders for the current season. Distinct from the
// Stats tab's watched-game panel, which only counts games the user has marked
// as watched — these are the season's actual leaders regardless.
// `data` is the shared leaders payload the view already fetches for the game
// cards' player-to-watch line. It's passed in rather than fetched again here;
// the local fetch is the fallback for rendering this tab standalone.
export default function NFLLeagueLeaders({ teamAbbrById, data: provided = null }) {
  const [fetched, setFetched] = useState(null)
  const [fetching, setFetching] = useState(true)
  const [error, setError]     = useState(null)
  const data = provided ?? fetched
  // Nothing is loading when the payload came from the view.
  const loading = !provided && fetching && !fetched

  useEffect(() => {
    if (provided) return
    let cancelled = false
    fetchNFLLeagueLeaders()
      .then(d => { if (!cancelled) setFetched(d) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setFetching(false) })
    return () => { cancelled = true }
  }, [provided])

  if (loading) return <LoadingSpinner message="Loading league leaders…" />
  if (error) return (
    <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">
      Failed to load leaders: {error}
    </div>
  )
  if (!data?.boards?.some(b => b.players.length)) return (
    <EmptyState emoji="🏈" title="No leaders yet" message="Leaderboards fill in once the season is under way." />
  )

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-500">League-wide leaders · {data.season} regular season</p>
      <div className="grid gap-6 md:grid-cols-2">
        {data.boards.map(b => <Board key={b.id} board={b} teamAbbrById={teamAbbrById} />)}
      </div>
    </div>
  )
}
