import { useEffect, useMemo, useState } from 'react'
import { fetchNBACupGames } from '../api/espn'
import { buildCupGroups, cupKnockouts } from '../utils/nbaCup'
import { useWatched } from '../contexts/WatchedContext'
import LoadingSpinner from './LoadingSpinner'
import EmptyState from './EmptyState'

function Logo({ src, alt }) {
  const [err, setErr] = useState(false)
  if (!src || err) return <span className="w-5 h-5 rounded-full bg-slate-700 shrink-0" />
  return <img src={src} alt={alt} width={20} height={20} className="object-contain shrink-0" onError={() => setErr(true)} />
}

function GroupTable({ group, trackedTeamId }) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">{group.label}</span>
        <span className="text-[10px] text-slate-600 tabular-nums">{group.countedGames}/{group.totalGames} results</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-slate-900/40 text-[10px] text-slate-600 uppercase tracking-wide">
            <th className="text-left px-3 py-1.5 font-medium">Team</th>
            <th className="px-2 py-1.5 font-medium text-right">W</th>
            <th className="px-2 py-1.5 font-medium text-right">L</th>
            <th className="px-3 py-1.5 font-medium text-right">PD</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row, i) => {
            const mine = String(row.id) === String(trackedTeamId)
            const leader = i === 0 && row.played > 0
            return (
              <tr key={row.id} className={`border-t border-slate-800/60 ${mine ? 'bg-purple-950/20' : i % 2 === 0 ? 'bg-[#161622]' : 'bg-[#131320]'}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Logo src={row.logo} alt={row.abbreviation} />
                    <span className={`text-xs font-medium ${mine ? 'text-purple-400' : 'text-slate-300'}`}>{row.name.split(' ').pop()}</span>
                    {leader && <span className="text-[9px] font-bold text-emerald-400 uppercase">1st</span>}
                  </div>
                </td>
                <td className="px-2 py-2 text-right text-xs font-bold tabular-nums text-slate-200">{row.w}</td>
                <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-400">{row.l}</td>
                <td className={`px-3 py-2 text-right text-xs tabular-nums ${row.pd > 0 ? 'text-green-400' : row.pd < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                  {row.pd > 0 ? `+${row.pd}` : row.pd}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KnockoutGame({ game, showScore }) {
  const final = game.status === 'final' && showScore
  const side = (team, score, won) => (
    <div className={`flex items-center gap-2 ${final && !won ? 'opacity-50' : ''}`}>
      <Logo src={team.logo} alt={team.abbreviation} />
      <span className="text-xs text-slate-300 flex-1">{team.name.split(' ').pop()}</span>
      {final && <span className={`text-xs tabular-nums ${won ? 'font-bold text-slate-100' : 'text-slate-500'}`}>{score}</span>}
    </div>
  )
  return (
    <div className="rounded-lg border border-slate-800 bg-[#161622] px-3 py-2 flex flex-col gap-1.5 min-w-[11rem]">
      {side(game.awayTeam, game.awayScore, game.awayScore > game.homeScore)}
      {side(game.homeTeam, game.homeScore, game.homeScore > game.awayScore)}
      <span className="text-[10px] text-slate-600">
        {game.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        {game.status === 'final' && !showScore ? ' · result hidden' : ''}
      </span>
    </div>
  )
}

/**
 * The NBA Cup as its own competition: group tables and the knockout rounds.
 * Results only count once the game is watched, unless the user reveals them,
 * matching the rest of the app's no-spoiler rule.
 */
export default function NBACupStandings({ season, trackedTeamId }) {
  const { isWatched } = useWatched()
  const [games, setGames] = useState(null)
  const [error, setError] = useState(null)
  const [revealAll, setRevealAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchNBACupGames(season)
      .then(g => { if (!cancelled) { setGames(g); setError(null) } })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [season])

  const counts = useMemo(
    () => g => revealAll || isWatched(g.id, 'nba'),
    [revealAll, isWatched]
  )
  const groups = useMemo(() => (games ? buildCupGroups(games, counts) : {}), [games, counts])
  const knockouts = useMemo(() => (games ? cupKnockouts(games) : []), [games])

  if (error) return <p className="text-sm text-slate-600">NBA Cup unavailable: {error}</p>
  if (!games) return <LoadingSpinner message="Loading NBA Cup..." />
  if (!games.length) {
    return <EmptyState emoji="🏆" title="No NBA Cup schedule yet" message="Group play starts in late October; the groups appear here once ESPN lists the games." />
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setRevealAll(v => !v)}
          aria-pressed={revealAll}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            revealAll ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
        >
          {revealAll ? 'Showing all results' : 'Show all results'}
        </button>
        <p className="text-[11px] text-slate-600">
          {revealAll ? 'Every Cup result counts, watched or not.' : 'Only results from games you’ve watched count, so nothing is spoiled.'}
          {' '}Group winners and one wildcard per conference reach the quarterfinals.
        </p>
      </div>

      {['East', 'West', 'Other'].filter(c => groups[c]).map(conf => (
        <section key={conf}>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{conf === 'Other' ? 'Groups' : `${conf}ern Conference`}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {groups[conf].map(g => <GroupTable key={g.label} group={g} trackedTeamId={trackedTeamId} />)}
          </div>
        </section>
      ))}

      {knockouts.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Knockouts</h3>
          <div className="flex flex-col gap-4">
            {knockouts.map(({ round, games: roundGames }) => (
              <div key={round}>
                <p className="text-[11px] text-slate-500 mb-2">{round}</p>
                <div className="flex flex-wrap gap-3">
                  {roundGames.map(g => <KnockoutGame key={g.id} game={g} showScore={revealAll || isWatched(g.id, 'nba')} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
