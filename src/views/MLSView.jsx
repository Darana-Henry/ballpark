import { useState, useEffect, useMemo } from 'react'
import { fetchMLSGames, fetchMLSStandings, fetchMLSStats, INTER_MIAMI_ID } from '../api/mls'
import GameCard from '../components/GameCard'
import SeasonStatsPanel from '../components/SeasonStatsPanel'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useWatched } from '../contexts/WatchedContext'

function getResult(game) {
  if (game.homeScore === null || game.awayScore === null) return null
  const isMiamiHome = game.homeTeam.id === INTER_MIAMI_ID
  const isMiamiAway = game.awayTeam.id === INTER_MIAMI_ID
  if (!isMiamiHome && !isMiamiAway) return null
  const miamiScore = isMiamiHome ? game.homeScore : game.awayScore
  const oppScore   = isMiamiHome ? game.awayScore  : game.homeScore
  if (miamiScore > oppScore) return 'win'
  if (miamiScore < oppScore) return 'loss'
  return 'draw'
}

function QueueTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showWatched, setShowWatched] = useState(false)

  const { upNext, nextScheduled, unwatched, watched } = useMemo(() => {
    const live = games.filter(g => g.status === 'live' && !isDismissed(g.id, 'mls'))
    const finalUnwatched = games
      .filter(g => g.status === 'final' && !isWatched(g.id, 'mls') && !isDismissed(g.id, 'mls'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const scheduled = games
      .filter(g => g.status === 'scheduled' && !isDismissed(g.id, 'mls'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const watchedList = games
      .filter(g => isWatched(g.id, 'mls'))
      .sort((a, b) => b.gameDate - a.gameDate)

    const upNext = finalUnwatched[0] ?? live[0] ?? scheduled[0]
    const upNextId = upNext?.id
    const remaining = [
      ...finalUnwatched.filter(g => g.id !== upNextId),
      ...live.filter(g => g.id !== upNextId),
      ...scheduled.filter(g => g.id !== upNextId),
    ]
    return { upNext, nextScheduled: scheduled[0] ?? null, unwatched: remaining, watched: watchedList }
  }, [games, isWatched, isDismissed])


  return (
    <div className="flex flex-col gap-3">
      {!upNext && unwatched.length === 0 && watched.length === 0 && (
        <EmptyState emoji="⚽" title="No matches yet" message="Check back once the season starts." />
      )}

      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameCard game={upNext} isUpNext showDismissAction trackedTeamId={INTER_MIAMI_ID} />
            <SeasonStatsPanel league="mls" trackedTeamId={INTER_MIAMI_ID} />
          </div>
        </>
      )}

      {unwatched.length > 0 && upNext && (
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 border-t border-white/[0.07]" />
          <span className="text-xs text-slate-600 shrink-0">{unwatched.length} more upcoming</span>
          <div className="flex-1 border-t border-white/[0.07]" />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {unwatched.map(g => <GameCard key={g.id} game={g} showDismissAction trackedTeamId={INTER_MIAMI_ID} />)}
      </div>

      {watched.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowWatched(v => !v)}
            className="w-full flex items-center gap-3 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <div className="flex-1 border-t border-white/[0.07]" />
            <span className="shrink-0 flex items-center gap-1.5">
              {showWatched ? '▾' : '▸'} {watched.length} watched
            </span>
            <div className="flex-1 border-t border-white/[0.07]" />
          </button>
          {showWatched && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {watched.map(g => <GameCard key={g.id} game={g} trackedTeamId={INTER_MIAMI_ID} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AllGamesTab({ games }) {
  const [filter, setFilter] = useState('all')

  const competitionFilters = useMemo(() => {
    const seen  = new Set()
    const types = games
      .map(g => g.gameType)
      .filter(t => t && !seen.has(t) && seen.add(t))
    return [{ id: 'all', label: 'All' }, ...types.map(t => ({ id: t, label: t }))]
  }, [games])

  const filtered = useMemo(() => {
    const sorted = [...games].sort((a, b) => b.gameDate - a.gameDate)
    if (filter !== 'all') return sorted.filter(g => g.gameType === filter)
    return sorted
  }, [games, filter])

  return (
    <>
      <div className="flex gap-1 mb-4 rounded-xl p-1 flex-wrap" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {competitionFilters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            style={filter === f.id ? { background: 'rgba(255,255,255,0.1)' } : {}}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map(g => <GameCard key={g.id} game={g} trackedTeamId={INTER_MIAMI_ID} />)}
      </div>
    </>
  )
}

function WatchedTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showSkipped, setShowSkipped] = useState(false)

  const watched = games.filter(g => isWatched(g.id, 'mls')).sort((a, b) => b.gameDate - a.gameDate)
  const skipped = games.filter(g => isDismissed(g.id, 'mls')).sort((a, b) => b.gameDate - a.gameDate)

  if (watched.length === 0 && skipped.length === 0) {
    return <EmptyState emoji="⚽" title="No watched matches yet" message="Mark matches as watched from My Queue." />
  }

  const wins   = watched.filter(g => getResult(g) === 'win').length
  const losses = watched.filter(g => getResult(g) === 'loss').length
  const draws  = watched.filter(g => getResult(g) === 'draw').length

  return (
    <div className="flex flex-col gap-3">
      {watched.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-2 rounded-xl px-4 py-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-green-400 font-bold text-lg">{wins}</span>
              <span className="text-slate-600 text-sm">W</span>
              <span className="text-slate-700 mx-1">·</span>
              <span className="text-slate-400 font-bold text-lg">{draws}</span>
              <span className="text-slate-600 text-sm">D</span>
              <span className="text-slate-700 mx-1">·</span>
              <span className="text-red-400 font-bold text-lg">{losses}</span>
              <span className="text-slate-600 text-sm">L</span>
            </div>
            <p className="text-xs text-slate-600">{watched.length} match{watched.length !== 1 ? 'es' : ''} watched</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {watched.map(g => <GameCard key={g.id} game={g} resultColor={getResult(g) === 'draw' ? null : getResult(g)} trackedTeamId={INTER_MIAMI_ID} />)}
          </div>
        </>
      )}

      {skipped.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowSkipped(v => !v)}
            className="w-full flex items-center gap-3 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <div className="flex-1 border-t border-white/[0.07]" />
            <span className="shrink-0 flex items-center gap-1.5">
              {showSkipped ? '▾' : '▸'} {skipped.length} skipped
            </span>
            <div className="flex-1 border-t border-white/[0.07]" />
          </button>
          {showSkipped && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {skipped.map(g => <GameCard key={g.id} game={g} showDismissAction trackedTeamId={INTER_MIAMI_ID} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Standings ────────────────────────────────────────────────────────────────

function TeamLogo({ src, alt, size = 20 }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-400 shrink-0"
        style={{ width: size, height: size }}>
        {alt?.slice(0, 3)}
      </div>
    )
  }
  return (
    <img src={src} alt={alt} width={size} height={size}
      className="rounded-full object-contain bg-slate-800/50 p-0.5 shrink-0"
      onError={() => setErr(true)} />
  )
}

function ConferenceTable({ conf }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span className="text-xs font-semibold text-slate-400">{conf.name}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[10px] text-slate-600 uppercase tracking-wide" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <th className="text-left px-3 py-1.5 font-medium">#</th>
            <th className="text-left px-3 py-1.5 font-medium">Team</th>
            <th className="px-2 py-1.5 font-medium text-right">GP</th>
            <th className="px-2 py-1.5 font-medium text-right">W</th>
            <th className="px-2 py-1.5 font-medium text-right">D</th>
            <th className="px-2 py-1.5 font-medium text-right">L</th>
            <th className="px-2 py-1.5 font-medium text-right">GF</th>
            <th className="px-2 py-1.5 font-medium text-right">GA</th>
            <th className="px-2 py-1.5 font-medium text-right">GD</th>
            <th className="px-3 py-1.5 font-medium text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {conf.entries.map((team, i) => {
            const isMiami = team.teamId === INTER_MIAMI_ID
            return (
              <tr key={team.teamId}
                className="border-t"
                style={{ borderColor: 'rgba(255,255,255,0.05)', background: isMiami ? 'rgba(236,72,153,0.08)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">{team.rank}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <TeamLogo src={team.logo} alt={team.abbreviation} size={20} />
                    <span className={`text-xs font-medium ${isMiami ? 'text-pink-400' : 'text-slate-300'}`}>
                      {team.teamName}
                    </span>
                    {isMiami && <span className="text-[10px] text-pink-700 hidden sm:inline">(you)</span>}
                  </div>
                </td>
                <td className="px-2 py-2 text-right text-xs text-slate-500 tabular-nums">{team.gamesPlayed}</td>
                <td className="px-2 py-2 text-right text-xs font-bold text-green-400 tabular-nums">{team.wins}</td>
                <td className="px-2 py-2 text-right text-xs text-slate-400 tabular-nums">{team.draws}</td>
                <td className="px-2 py-2 text-right text-xs text-red-400/80 tabular-nums">{team.losses}</td>
                <td className="px-2 py-2 text-right text-xs text-slate-400 tabular-nums">{team.gf}</td>
                <td className="px-2 py-2 text-right text-xs text-slate-400 tabular-nums">{team.ga}</td>
                <td className={`px-2 py-2 text-right text-xs tabular-nums font-medium ${team.gd?.startsWith('+') ? 'text-green-400' : team.gd?.startsWith('-') ? 'text-red-400' : 'text-slate-500'}`}>{team.gd}</td>
                <td className="px-3 py-2 text-right text-xs font-bold text-slate-100 tabular-nums">{team.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StandingsTab() {
  const [standings, setStandings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMLSStandings()
      .then(setStandings)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading standings..." />
  if (!standings) return <p className="text-sm text-slate-600">Standings unavailable.</p>

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-500">Live MLS standings · Inter Miami highlighted in pink</p>
      {standings.map(conf => (
        <ConferenceTable key={conf.name} conf={conf} />
      ))}
    </div>
  )
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function PlayerRow({ leader, rank }) {
  const [imgErr, setImgErr] = useState(false)
  const rankColor = rank === 0 ? 'text-yellow-400' : rank === 1 ? 'text-slate-300' : rank === 2 ? 'text-amber-600' : 'text-slate-600'
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: rank > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
      <span className={`text-xs font-bold tabular-nums w-5 shrink-0 ${rankColor}`}>{rank + 1}</span>
      {leader.athlete.photo && !imgErr ? (
        <img src={leader.athlete.photo} alt={leader.athlete.name} width={32} height={32}
          className="rounded-full object-cover object-top bg-slate-800 shrink-0"
          onError={() => setImgErr(true)} />
      ) : (
        <div className="w-8 h-8 rounded-full bg-slate-700 shrink-0 flex items-center justify-center text-xs font-bold text-slate-400">
          {(leader.athlete.shortName || leader.athlete.name || '?')[0]}
        </div>
      )}
      <span className="text-sm font-medium text-slate-200 flex-1 truncate">{leader.athlete.name}</span>
      {leader.matches !== null && (
        <span className="text-xs text-slate-600 shrink-0 tabular-nums">{leader.matches}gp</span>
      )}
      <span className="text-lg font-bold tabular-nums text-slate-100 shrink-0 ml-1 w-8 text-right">{leader.value}</span>
    </div>
  )
}

function LeaderTable({ category }) {
  return (
    <section>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{category.displayName} Leaders · 2026 Season</p>
      <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {category.leaders.map((l, i) => <PlayerRow key={l.athlete.id ?? i} leader={l} rank={i} />)}
      </div>
    </section>
  )
}

function StatsTab({ games }) {
  const { watchedGames } = useWatched()
  const [leagueStats, setLeagueStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    fetchMLSStats()
      .then(setLeagueStats)
      .catch(console.error)
      .finally(() => setStatsLoading(false))
  }, [])

  const watched = useMemo(
    () => Object.values(watchedGames).filter(g => g.league === 'mls' && g.watched),
    [watchedGames]
  )

  const results = useMemo(() => watched.map(g => {
    if (g.homeScore === null || g.awayScore === null) return null
    const isMiamiHome = g.homeTeamId === INTER_MIAMI_ID
    const isMiamiAway = g.awayTeamId === INTER_MIAMI_ID
    if (!isMiamiHome && !isMiamiAway) return null
    const mf = isMiamiHome ? g.homeScore : g.awayScore
    const opp = isMiamiHome ? g.awayScore : g.homeScore
    return { mf, opp, result: mf > opp ? 'W' : mf < opp ? 'L' : 'D' }
  }).filter(Boolean), [watched])

  const wins = results.filter(r => r.result === 'W').length
  const draws = results.filter(r => r.result === 'D').length
  const losses = results.filter(r => r.result === 'L').length
  const gf = results.reduce((s, r) => s + r.mf, 0)
  const ga = results.reduce((s, r) => s + r.opp, 0)
  const pts = wins * 3 + draws
  const cleanSheets = results.filter(r => r.opp === 0).length

  const form = [...watched]
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
    .slice(0, 5)
    .map(g => {
      if (g.homeScore === null || g.awayScore === null) return null
      const mf = g.homeTeamId === INTER_MIAMI_ID ? g.homeScore : g.awayScore
      const opp = g.homeTeamId === INTER_MIAMI_ID ? g.awayScore : g.homeScore
      return mf > opp ? 'W' : mf < opp ? 'L' : 'D'
    }).filter(Boolean)

  const statCard = (label, value, sub) => (
    <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-bold text-slate-100 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )

  return (
    <div className="flex flex-col gap-8">

      {/* League leaders — always shown */}
      {statsLoading ? (
        <LoadingSpinner message="Loading MLS stats..." />
      ) : leagueStats?.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {leagueStats.map(cat => <LeaderTable key={cat.name} category={cat} />)}
        </div>
      ) : null}

      {/* Personal watched record */}
      {watched.length > 0 && (
        <section>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
            My Watched Record · {watched.length} match{watched.length !== 1 ? 'es' : ''}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            {statCard('Wins', wins)}
            {statCard('Draws', draws)}
            {statCard('Losses', losses)}
            {statCard('Points', pts, `${wins}W + ${draws}D`)}
            {statCard('Goals For', gf, `${results.length > 0 ? (gf / results.length).toFixed(1) : 0}/match`)}
            {statCard('Goals Against', ga, `${cleanSheets} clean sheet${cleanSheets !== 1 ? 's' : ''}`)}
          </div>
          {form.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Last {form.length} Results</p>
              <div className="flex gap-2">
                {form.map((r, i) => (
                  <div key={i} className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                    r === 'W' ? 'bg-green-500/20 text-green-400 border border-green-500/40' :
                    r === 'L' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                    'bg-slate-700/50 text-slate-400 border border-slate-600/40'
                  }`}>{r}</div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {!statsLoading && watched.length === 0 && (
        <p className="text-xs text-slate-600">Mark matches as watched in My Queue to see your personal record here.</p>
      )}
    </div>
  )
}

// ─── Playoffs ─────────────────────────────────────────────────────────────────

function MLSPlayoffGame({ game }) {
  const [homeErr, setHomeErr] = useState(false)
  const [awayErr, setAwayErr] = useState(false)
  const isFinal = game.status === 'final'
  const homeLogo = game.homeTeam.logo
  const awayLogo = game.awayTeam.logo

  const homeName = game.homeTeam.name
  const awayName = game.awayTeam.name
  const homeScore = game.homeScore
  const awayScore = game.awayScore
  const homeWon = isFinal && homeScore > awayScore
  const awayWon = isFinal && awayScore > homeScore

  const isMiamiHome = game.homeTeam.id === INTER_MIAMI_ID
  const isMiamiAway = game.awayTeam.id === INTER_MIAMI_ID
  const miamiWon = (isMiamiHome && homeWon) || (isMiamiAway && awayWon)

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${miamiWon ? 'rgba(236,72,153,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
        <span className="text-[10px] text-slate-500">
          {game.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <span className={`text-[10px] font-semibold ${isFinal ? (miamiWon ? 'text-pink-400' : 'text-slate-500') : 'text-slate-500'}`}>
          {isFinal ? (miamiWon ? 'WIN' : 'LOSS') : game.statusDetail || 'Scheduled'}
        </span>
      </div>
      {[
        { team: game.awayTeam, score: awayScore, won: awayWon, logo: awayLogo, err: awayErr, setErr: setAwayErr },
        { team: game.homeTeam, score: homeScore, won: homeWon, logo: homeLogo, err: homeErr, setErr: setHomeErr },
      ].map(({ team, score, won, logo, err, setErr }, i) => {
        const isMiami = team.id === INTER_MIAMI_ID
        return (
          <div key={team.id} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            {logo && !err ? (
              <img src={logo} alt={team.abbreviation} width={24} height={24}
                className="rounded-full object-contain bg-slate-800/50 p-0.5 shrink-0"
                onError={() => setErr(true)} />
            ) : (
              <div className="w-6 h-6 rounded-full bg-slate-700 shrink-0 flex items-center justify-center text-[8px] font-bold text-slate-400">
                {team.abbreviation?.slice(0, 3)}
              </div>
            )}
            <span className={`text-sm font-medium flex-1 ${isMiami ? 'text-pink-300' : won ? 'text-slate-100' : 'text-slate-400'}`}>
              {team.name}
            </span>
            {score !== null && (
              <span className={`text-lg font-bold tabular-nums ${won ? 'text-slate-100' : 'text-slate-500'}`}>{score}</span>
            )}
          </div>
        )
      })}
      {game.venue && (
        <div className="px-3 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <span className="text-[10px] text-slate-600">{game.venue}</span>
        </div>
      )}
    </div>
  )
}

function MLSBracketTab({ games }) {
  const playoffGames = useMemo(() =>
    games
      .filter(g => g.gameType === 'MLS Cup Playoffs')
      .sort((a, b) => a.gameDate - b.gameDate),
    [games]
  )

  if (playoffGames.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-3xl mb-3">⚽</p>
        <p className="text-slate-400 font-medium">No playoff matches yet</p>
        <p className="text-sm text-slate-600 mt-1">MLS Cup Playoffs run October–December</p>
      </div>
    )
  }

  // Group into rounds by sequence (each round is roughly 1–2 weeks apart)
  const rounds = []
  let currentRound = []
  let lastDate = null
  for (const g of playoffGames) {
    if (lastDate && (g.gameDate - lastDate) > 12 * 24 * 60 * 60 * 1000) {
      if (currentRound.length) rounds.push(currentRound)
      currentRound = []
    }
    currentRound.push(g)
    lastDate = g.gameDate
  }
  if (currentRound.length) rounds.push(currentRound)

  const roundLabels = ['Round One', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'MLS Cup Final']

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-slate-500">Inter Miami's MLS Cup Playoffs run · rounds inferred from match dates</p>
      {rounds.map((roundGames, ri) => (
        <section key={ri}>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
            {roundLabels[ri] ?? `Round ${ri + 1}`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {roundGames.map(g => <MLSPlayoffGame key={g.id} game={g} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

const TABS = [
  { id: 'queue',      label: 'My Queue'   },
  { id: 'all',        label: 'All Games'  },
  { id: 'watched',    label: 'Watched'    },
  { id: 'standings',  label: 'Standings'  },
  { id: 'playoffs',   label: 'Playoffs'   },
  { id: 'stats',      label: 'Stats'      },
]

export default function MLSView() {
  const [games, setGames]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [tab, setTab]         = useState('queue')

  useEffect(() => {
    fetchMLSGames()
      .then(setGames)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-4 mb-7">
        <img
          src="https://a.espncdn.com/i/teamlogos/soccer/500/20232.png"
          alt="Inter Miami CF"
          width={72} height={72}
          className="rounded-full object-contain bg-pink-950/40 border border-pink-900/40 p-1.5 shrink-0"
        />
        <div>
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">MLS · Inter Miami</h2>
          <p className="text-sm text-slate-500 mt-0.5">Inter Miami CF · All Competitions</p>
        </div>
      </div>

      <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5 scrollbar-hide" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            style={tab === t.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
            {t.label}
            {tab === t.id && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-pink-500 rounded-full" />}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner message="Loading Inter Miami matches..." />}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">
          Failed to load: {error}
        </div>
      )}

      {!loading && !error && tab === 'queue'   && <QueueTab games={games} />}
      {!loading && !error && tab === 'all'     && <AllGamesTab games={games} />}
      {!loading && !error && tab === 'watched' && <WatchedTab games={games} />}
      {tab === 'standings' && <StandingsTab />}
      {tab === 'playoffs'  && <MLSBracketTab games={games} />}
      {!loading && !error && tab === 'stats' && <StatsTab games={games} />}
    </div>
  )
}
