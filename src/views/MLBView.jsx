import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchMLBGames, fetchStatsFromWatchedGames, fetchMLBStandings } from '../api/mlb'
import GameCard from '../components/GameCard'
import SeasonStatsPanel from '../components/SeasonStatsPanel'
import { HitterCard, HRLeaderCard, RBILeaderCard, PitcherCard, WinsLeaderCard } from '../components/PlayerStatCard'
import SeasonFilter from '../components/SeasonFilter'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useWatched } from '../contexts/WatchedContext'
import { getSeasonYear, getAvailableSeasons } from '../utils/season'

const DODGERS_ID = '119'

const MLB_PLAYOFF_TYPES = new Set(['Wild Card', 'Division Series', 'League Championship', 'World Series'])

function computeMLBSeries(games, teamAId, teamBId, winsNeeded, isProcessed) {
  if (!teamAId || !teamBId) return { winsA: 0, winsB: 0, hasGames: false, winner: null }
  const seriesGames = games.filter(g =>
    g.status === 'final' &&
    MLB_PLAYOFF_TYPES.has(g.gameType) &&
    ((g.homeTeam.id === teamAId && g.awayTeam.id === teamBId) ||
     (g.homeTeam.id === teamBId && g.awayTeam.id === teamAId))
  )
  let winsA = 0, winsB = 0
  for (const g of seriesGames) {
    if (!isProcessed(g.id)) continue
    if (g.homeScore === null || g.awayScore === null) continue
    const homeIsA = g.homeTeam.id === teamAId
    if (g.homeScore > g.awayScore) homeIsA ? winsA++ : winsB++
    else if (g.awayScore > g.homeScore) homeIsA ? winsB++ : winsA++
  }
  return { winsA, winsB, hasGames: winsA + winsB > 0, winner: winsA >= winsNeeded ? teamAId : winsB >= winsNeeded ? teamBId : null }
}

function buildMLBBracket(seeds, games, isProcessed) {
  if (!seeds || seeds.length < 6) return null
  const [s1, s2, s3, s4, s5, s6] = seeds
  const wc1 = computeMLBSeries(games, s3.teamId, s6.teamId, 2, isProcessed) // 3v6 BO3
  const wc2 = computeMLBSeries(games, s4.teamId, s5.teamId, 2, isProcessed) // 4v5 BO3
  const wc1Winner = wc1.winner ? (wc1.winner === s3.teamId ? s3 : s6) : null
  const wc2Winner = wc2.winner ? (wc2.winner === s4.teamId ? s4 : s5) : null
  // s1 plays wc2 winner (4/5); s2 plays wc1 winner (3/6)
  const ds1 = computeMLBSeries(games, s1.teamId, wc2Winner?.teamId ?? null, 3, isProcessed)
  const ds2 = computeMLBSeries(games, s2.teamId, wc1Winner?.teamId ?? null, 3, isProcessed)
  const ds1Winner = ds1.winner ? (ds1.winner === s1.teamId ? s1 : wc2Winner) : null
  const ds2Winner = ds2.winner ? (ds2.winner === s2.teamId ? s2 : wc1Winner) : null
  const lcs = computeMLBSeries(games, ds1Winner?.teamId ?? null, ds2Winner?.teamId ?? null, 4, isProcessed)
  const lcsWinner = lcs.winner ? (lcs.winner === ds1Winner?.teamId ? ds1Winner : ds2Winner) : null
  return { s1, s2, s3, s4, s5, s6, wc1, wc2, wc1Winner, wc2Winner, ds1, ds2, ds1Winner, ds2Winner, lcs, lcsWinner }
}

// ─── My Queue ────────────────────────────────────────────────────────────────

function QueueTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showWatched, setShowWatched] = useState(false)

  const { upNext, unwatched, watched } = useMemo(() => {
    const live = games.filter(g => g.status === 'live' && !isDismissed(g.id, 'mlb'))
    const finalUnwatched = games
      .filter(g => g.status === 'final' && !isWatched(g.id, 'mlb') && !isDismissed(g.id, 'mlb'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const scheduled = games
      .filter(g => g.status === 'scheduled' && !isDismissed(g.id, 'mlb'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const watchedList = games
      .filter(g => isWatched(g.id, 'mlb'))
      .sort((a, b) => b.gameDate - a.gameDate)

    // Prefer final unwatched → live → next scheduled
    const upNext = finalUnwatched[0] ?? live[0] ?? scheduled[0]
    const upNextId = upNext?.id
    const remaining = [
      ...finalUnwatched.filter(g => g.id !== upNextId),
      ...live.filter(g => g.id !== upNextId),
      ...scheduled.filter(g => g.id !== upNextId),
    ]
    return { upNext, unwatched: remaining, watched: watchedList }
  }, [games, isWatched, isDismissed])

  return (
    <div className="flex flex-col gap-3">
      {!upNext && unwatched.length === 0 && watched.length === 0 && (
        <EmptyState emoji="⚾" title="No games yet" message="Check back once the season starts." />
      )}

      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameCard game={upNext} isUpNext showDismissAction trackedTeamId={DODGERS_ID} />
            <SeasonStatsPanel league="mlb" trackedTeamId={DODGERS_ID} />
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
        {unwatched.map(g => <GameCard key={g.id} game={g} showDismissAction trackedTeamId={DODGERS_ID} />)}
      </div>

      {watched.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowWatched(v => !v)}
            className="w-full flex items-center gap-3 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <div className="flex-1 border-t border-slate-800" />
            <span className="shrink-0 flex items-center gap-1.5">
              {showWatched ? '▾' : '▸'} {watched.length} watched
            </span>
            <div className="flex-1 border-t border-slate-800" />
          </button>
          {showWatched && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {watched.map(g => <GameCard key={g.id} game={g} trackedTeamId={DODGERS_ID} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── All Games ───────────────────────────────────────────────────────────────

const GAME_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'regular', label: 'Regular Season' },
]
const PLAYOFF_TYPES = new Set(['Wild Card', 'Division Series', 'League Championship', 'World Series'])

function AllGamesTab({ games }) {
  const [filter, setFilter] = useState('all')
  const filtered = useMemo(() => {
    const sorted = [...games].sort((a, b) => b.gameDate - a.gameDate)
    if (filter === 'playoffs') return sorted.filter(g => PLAYOFF_TYPES.has(g.gameType))
    if (filter === 'regular')  return sorted.filter(g => g.gameType === 'Regular Season')
    return sorted
  }, [games, filter])

  return (
    <>
      <div className="flex gap-1 mb-4 bg-slate-900 rounded-xl p-1 w-fit">
        {GAME_FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.id ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map(g => <GameCard key={g.id} game={g} trackedTeamId={DODGERS_ID} />)}
      </div>
    </>
  )
}

// ─── Watched ──────────────────────────────────────────────────────────────────

function getResult(game) {
  if (game.homeScore === null || game.awayScore === null) return null
  const isDodgersHome = game.homeTeam.id === DODGERS_ID
  const isDodgersAway = game.awayTeam.id === DODGERS_ID
  if (!isDodgersHome && !isDodgersAway) return null
  const dodgersScore = isDodgersHome ? game.homeScore : game.awayScore
  const oppScore     = isDodgersHome ? game.awayScore  : game.homeScore
  return dodgersScore > oppScore ? 'win' : dodgersScore < oppScore ? 'loss' : null
}

function WatchedTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showSkipped, setShowSkipped] = useState(false)

  const watched = games
    .filter(g => isWatched(g.id, 'mlb'))
    .sort((a, b) => b.gameDate - a.gameDate)

  const skipped = games
    .filter(g => isDismissed(g.id, 'mlb'))
    .sort((a, b) => b.gameDate - a.gameDate)

  if (watched.length === 0 && skipped.length === 0) {
    return (
      <EmptyState emoji="⚾" title="No watched games yet"
        message="Mark games as watched from My Queue — they'll appear here so you can review or unwatch them." />
    )
  }

  const wins   = watched.filter(g => getResult(g) === 'win').length
  const losses = watched.filter(g => getResult(g) === 'loss').length

  return (
    <div className="flex flex-col gap-3">
      {watched.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-2 bg-slate-900 rounded-xl px-4 py-2">
              <span className="text-green-400 font-bold text-lg">{wins}</span>
              <span className="text-slate-600 text-sm">W</span>
              <span className="text-slate-700 mx-1">·</span>
              <span className="text-red-400 font-bold text-lg">{losses}</span>
              <span className="text-slate-600 text-sm">L</span>
            </div>
            <p className="text-xs text-slate-600">{watched.length} game{watched.length !== 1 ? 's' : ''} watched · green = win, red = loss</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {watched.map(g => (
              <GameCard key={g.id} game={g} resultColor={getResult(g)} trackedTeamId={DODGERS_ID} />
            ))}
          </div>
        </>
      )}

      {skipped.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowSkipped(v => !v)}
            className="w-full flex items-center gap-3 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <div className="flex-1 border-t border-slate-800" />
            <span className="shrink-0 flex items-center gap-1.5">
              {showSkipped ? '▾' : '▸'} {skipped.length} skipped
            </span>
            <div className="flex-1 border-t border-slate-800" />
          </button>
          {showSkipped && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {skipped.map(g => <GameCard key={g.id} game={g} showDismissAction trackedTeamId={DODGERS_ID} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Standings ───────────────────────────────────────────────────────────────

function TeamLogo({ teamId, size = 24 }) {
  const [err, setErr] = useState(false)
  const src = `https://www.mlbstatic.com/team-logos/${teamId}.svg`
  if (err) return <div style={{ width: size, height: size }} className="rounded-full bg-slate-700 shrink-0" />
  return (
    <img src={src} width={size} height={size}
      className="rounded-full object-contain bg-slate-800/50 p-0.5 shrink-0"
      onError={() => setErr(true)} />
  )
}

function DivisionTable({ division, vsMap }) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400">{division.name}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-slate-900/40 text-[10px] text-slate-600 uppercase tracking-wide">
            <th className="text-left px-3 py-1.5 font-medium">Team</th>
            <th className="px-3 py-1.5 font-medium text-right">W</th>
            <th className="px-3 py-1.5 font-medium text-right">L</th>
          </tr>
        </thead>
        <tbody>
          {division.teams.map((team, i) => {
            const isDodgers = team.teamId === DODGERS_ID
            const rec = vsMap[team.teamId] ?? { w: 0, l: 0 }
            const hasFaced = rec.w > 0 || rec.l > 0
            return (
              <tr key={team.teamId}
                className={`border-t border-slate-800/60 ${isDodgers ? 'bg-blue-950/20' : i % 2 === 0 ? 'bg-[#161622]' : 'bg-[#131320]'}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <TeamLogo teamId={team.teamId} size={20} />
                    <span className={`text-xs font-medium ${isDodgers ? 'text-blue-400' : 'text-slate-300'}`}>
                      {team.teamName.split(' ').pop()}
                    </span>
                    {isDodgers && <span className="text-[10px] text-blue-600 hidden sm:inline">(you)</span>}
                  </div>
                </td>
                <td className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${
                  !hasFaced ? 'text-slate-700' : rec.w >= rec.l ? 'text-green-400' : 'text-slate-300'
                }`}>{rec.w}</td>
                <td className={`px-3 py-2 text-right text-xs tabular-nums ${
                  !hasFaced ? 'text-slate-700' : 'text-slate-400'
                }`}>{rec.l}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BracketTeam({ seed, wins = null, isWinner = false, isPlaceholder = false }) {
  const isDodgers = !isPlaceholder && seed?.teamId === DODGERS_ID
  const name = isPlaceholder ? (seed?.label ?? 'TBD') : (seed?.teamName?.split(' ').pop() ?? '?')
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1.5 ${
      isWinner ? 'bg-green-950/30' : isDodgers ? 'bg-blue-950/30' : ''
    }`}>
      <span className="text-[9px] font-bold tabular-nums text-slate-600 w-3 shrink-0">
        {isPlaceholder ? '?' : seed?.seed}
      </span>
      {!isPlaceholder && seed?.teamId
        ? <TeamLogo teamId={seed.teamId} size={14} />
        : <div className="w-3.5 h-3.5 rounded-full bg-slate-800 shrink-0" />
      }
      <span className={`text-[11px] font-medium flex-1 max-w-[66px] truncate ${
        isWinner ? 'text-green-400' : isDodgers ? 'text-blue-400' : isPlaceholder ? 'text-slate-600' : 'text-slate-300'
      }`}>{name}</span>
      {wins !== null && !isPlaceholder && (
        <span className={`text-[10px] font-bold tabular-nums shrink-0 ml-0.5 ${isWinner ? 'text-green-400' : 'text-slate-500'}`}>
          {wins}
        </span>
      )}
    </div>
  )
}

function BracketMatchup({ top, bottom, winsTop = null, winsBottom = null, winnerId = null, topPlaceholder = false, bottomPlaceholder = false }) {
  return (
    <div className={`rounded-lg border overflow-hidden min-w-[120px] ${winnerId ? 'border-green-900/40' : 'border-slate-700/60'}`}>
      <BracketTeam seed={top} wins={winsTop} isWinner={!topPlaceholder && !!winnerId && winnerId === top?.teamId} isPlaceholder={topPlaceholder} />
      <div className="h-px bg-slate-800" />
      <BracketTeam seed={bottom} wins={winsBottom} isWinner={!bottomPlaceholder && !!winnerId && winnerId === bottom?.teamId} isPlaceholder={bottomPlaceholder} />
    </div>
  )
}

function PlayoffBracket({ title, bracket }) {
  if (!bracket) return null
  const { s1, s2, s3, s4, s5, s6, wc1, wc2, wc1Winner, wc2Winner, ds1, ds2, ds1Winner, ds2Winner, lcs } = bracket

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f0f1a] p-4">
      <p className="text-xs font-semibold text-slate-300 mb-4">{title}</p>
      <div className="flex items-start gap-3 overflow-x-auto pb-2">

        <div className="flex flex-col gap-2.5 shrink-0">
          <p className="text-[9px] text-slate-600 uppercase tracking-widest">Wild Card</p>
          <BracketMatchup top={s3} bottom={s6}
            winsTop={wc1.hasGames ? wc1.winsA : null} winsBottom={wc1.hasGames ? wc1.winsB : null}
            winnerId={wc1.winner} />
          <BracketMatchup top={s4} bottom={s5}
            winsTop={wc2.hasGames ? wc2.winsA : null} winsBottom={wc2.hasGames ? wc2.winsB : null}
            winnerId={wc2.winner} />
        </div>

        <div className="text-slate-700 mt-10 shrink-0">›</div>

        <div className="flex flex-col gap-2.5 shrink-0">
          <p className="text-[9px] text-slate-600 uppercase tracking-widest">Div Series</p>
          <BracketMatchup top={s1} bottom={wc2Winner}
            winsTop={ds1.hasGames ? ds1.winsA : null} winsBottom={ds1.hasGames ? ds1.winsB : null}
            winnerId={ds1.winner} bottomPlaceholder={!wc2Winner} />
          <BracketMatchup top={s2} bottom={wc1Winner}
            winsTop={ds2.hasGames ? ds2.winsA : null} winsBottom={ds2.hasGames ? ds2.winsB : null}
            winnerId={ds2.winner} bottomPlaceholder={!wc1Winner} />
        </div>

        <div className="text-slate-700 mt-10 shrink-0">›</div>

        <div className="flex flex-col gap-2.5 shrink-0">
          <p className="text-[9px] text-slate-600 uppercase tracking-widest">LCS</p>
          <BracketMatchup top={ds1Winner} bottom={ds2Winner}
            winsTop={lcs.hasGames ? lcs.winsA : null} winsBottom={lcs.hasGames ? lcs.winsB : null}
            winnerId={lcs.winner} topPlaceholder={!ds1Winner} bottomPlaceholder={!ds2Winner} />
        </div>

      </div>
      <p className="text-[9px] text-slate-700 mt-2">Seeds 1 & 2 have first-round byes · updates as you watch playoff games</p>
    </div>
  )
}

function StandingsTab() {
  const { watchedGames } = useWatched()
  const [standings, setStandings] = useState(null)
  const [standingsLoading, setStandingsLoading] = useState(true)
  const [seasonFilter, setSeasonFilter] = useState('all')

  const availableSeasons = useMemo(
    () => getAvailableSeasons(watchedGames, 'mlb'),
    [watchedGames]
  )

  useEffect(() => {
    fetchMLBStandings()
      .then(setStandings)
      .catch(console.error)
      .finally(() => setStandingsLoading(false))
  }, [])

  const vsMap = useMemo(() => {
    const map = {}
    Object.values(watchedGames).forEach(g => {
      if (g.league !== 'mlb' || !g.watched) return
      if (g.homeScore === null || g.awayScore === null) return
      if (seasonFilter !== 'all' && getSeasonYear('mlb', g.gameDate) !== seasonFilter) return
      const isDodgersHome = g.homeTeamId === DODGERS_ID
      const isDodgersAway = g.awayTeamId === DODGERS_ID
      if (!isDodgersHome && !isDodgersAway) return
      const dodgersScore = isDodgersHome ? g.homeScore : g.awayScore
      const oppScore     = isDodgersHome ? g.awayScore : g.homeScore
      const oppId        = isDodgersHome ? g.awayTeamId : g.homeTeamId
      if (!map[oppId]) map[oppId] = { w: 0, l: 0 }
      if (dodgersScore > oppScore) map[oppId].w++
      else if (oppScore > dodgersScore) map[oppId].l++
    })
    return map
  }, [watchedGames, seasonFilter])

  if (standingsLoading) return <LoadingSpinner message="Loading standings..." />
  if (!standings) return <p className="text-sm text-slate-600">Standings unavailable.</p>

  const nlDivisions = standings.divisions.filter(d => d.league === 'NL')
  const alDivisions = standings.divisions.filter(d => d.league === 'AL')

  return (
    <div className="flex flex-col gap-8">

      <SeasonFilter league="mlb" seasons={availableSeasons} selected={seasonFilter} onChange={setSeasonFilter} />

      {[
        { label: 'National League', divisions: nlDivisions },
        { label: 'American League', divisions: alDivisions },
      ].map(({ label, divisions }) => (
        <section key={label}>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{label}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {divisions.map(div => <DivisionTable key={div.id} division={div} vsMap={vsMap} />)}
          </div>
          <p className="text-[10px] text-slate-700 mt-2">Order = real-life standings · W/L = Dodgers head-to-head from your watched games</p>
        </section>
      ))}

    </div>
  )
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function StatSection({ title, sub, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest shrink-0">{title}</h3>
        {sub && <span className="text-xs text-slate-600 hidden sm:inline">{sub}</span>}
        <div className="flex-1 border-t border-slate-800" />
      </div>
      {/* 3-column grid; horizontally scrollable on very small screens */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {children}
      </div>
    </section>
  )
}

function StatsTab() {
  const { watchedGames } = useWatched()
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [seasonFilter, setSeasonFilter] = useState('all')

  const mlbWatched = useMemo(
    () => Object.values(watchedGames).filter(g => g.league === 'mlb' && g.watched),
    [watchedGames]
  )

  const availableSeasons = useMemo(
    () => getAvailableSeasons(watchedGames, 'mlb'),
    [watchedGames]
  )

  const filteredWatched = useMemo(
    () => seasonFilter === 'all'
      ? mlbWatched
      : mlbWatched.filter(g => getSeasonYear('mlb', g.gameDate) === seasonFilter),
    [mlbWatched, seasonFilter]
  )

  useEffect(() => {
    if (!filteredWatched.length) { setStats(null); return }
    setLoading(true)
    setError(null)
    fetchStatsFromWatchedGames(filteredWatched)
      .then(setStats)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [filteredWatched.length, seasonFilter])

  if (!mlbWatched.length) return (
    <EmptyState emoji="📊" title="No watched games yet"
      message="Mark games as watched in My Queue — stats will be computed from only those games." />
  )

  if (loading) return <LoadingSpinner message={`Fetching stats from ${filteredWatched.length} watched game${filteredWatched.length !== 1 ? 's' : ''}…`} />

  if (error) return (
    <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">
      Failed to load stats: {error}
    </div>
  )

  const noData = !stats || (!stats.baLeaders?.length && !stats.eraLeaders?.length)
  if (noData) return (
    <EmptyState emoji="📊" title="Not enough data yet"
      message="Watch a few more games — players need at least 3 at-bats or 1 inning to appear." />
  )

  return (
    <div className="flex flex-col gap-7">
      <SeasonFilter league="mlb" seasons={availableSeasons} selected={seasonFilter} onChange={setSeasonFilter} />
      {/* Context header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Stats computed from <span className="text-slate-300 font-medium">{stats.gameCount}</span> watched game{stats.gameCount !== 1 ? 's' : ''}
        </p>
        <div className="flex gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Elite</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Solid</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Avg</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Struggling</span>
        </div>
      </div>

      {stats.baLeaders?.length > 0 && (
        <StatSection title="Batting Average" sub="≥.300 elite · .250 avg · <.220 struggling">
          {stats.baLeaders.map((p, i) => <HitterCard key={p.id} player={p} rank={i} />)}
        </StatSection>
      )}

      {stats.hrLeaders?.length > 0 && (
        <StatSection title="Home Runs" sub="Power hitters">
          {stats.hrLeaders.map((p, i) => <HRLeaderCard key={p.id} player={p} rank={i} />)}
        </StatSection>
      )}

      {stats.rbiLeaders?.length > 0 && (
        <StatSection title="RBI" sub="Run producers">
          {stats.rbiLeaders.map((p, i) => <RBILeaderCard key={p.id} player={p} rank={i} />)}
        </StatSection>
      )}

      {stats.eraLeaders?.length > 0 && (
        <StatSection title="ERA" sub="<3.00 elite · 3–4 solid · >5.00 struggling">
          {stats.eraLeaders.map((p, i) => <PitcherCard key={p.id} player={p} rank={i} />)}
        </StatSection>
      )}

      {stats.winsLeaders?.length > 0 && (
        <StatSection title="Starter Wins" sub="Starting pitchers only">
          {stats.winsLeaders.map((p, i) => <WinsLeaderCard key={p.id} player={p} rank={i} />)}
        </StatSection>
      )}
    </div>
  )
}

// ─── Playoffs ─────────────────────────────────────────────────────────────────

function MLBBracketTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [standings, setStandings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMLBStandings().then(setStandings).catch(console.error).finally(() => setLoading(false))
  }, [])

  const isProcessed = useCallback(id => isWatched(id, 'mlb') || isDismissed(id, 'mlb'), [isWatched, isDismissed])

  const nlBracket = useMemo(() =>
    standings ? buildMLBBracket(standings.nlSeeds, games, isProcessed) : null,
    [standings, games, isProcessed])

  const alBracket = useMemo(() =>
    standings ? buildMLBBracket(standings.alSeeds, games, isProcessed) : null,
    [standings, games, isProcessed])

  const nlChamp = nlBracket?.lcsWinner
  const alChamp = alBracket?.lcsWinner

  const wsSeries = useMemo(() => {
    if (!nlChamp || !alChamp) return null
    return computeMLBSeries(games, nlChamp.teamId, alChamp.teamId, 4, isProcessed)
  }, [games, nlChamp, alChamp, isProcessed])

  if (loading) return <LoadingSpinner message="Loading bracket..." />
  if (!standings) return <p className="text-sm text-slate-600">Bracket unavailable.</p>

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">Bracket updates as you watch or skip playoff games</p>
      <PlayoffBracket title="National League" bracket={nlBracket} />
      <PlayoffBracket title="American League" bracket={alBracket} />
      {(nlChamp || alChamp) && (
        <div className="rounded-xl border border-slate-800 bg-[#0f0f1a] p-4">
          <p className="text-xs font-semibold text-slate-300 mb-4">World Series</p>
          <div className="flex justify-center">
            <div className={`rounded-lg border overflow-hidden min-w-[140px] ${wsSeries?.winner ? 'border-green-900/40' : 'border-slate-700/60'}`}>
              {[
                { label: 'NL', team: nlChamp, wins: wsSeries?.hasGames ? wsSeries.winsA : null },
                { label: 'AL', team: alChamp,  wins: wsSeries?.hasGames ? wsSeries.winsB : null },
              ].map(({ label, team, wins }, i) => {
                const isWinner = !!wsSeries?.winner && team && wsSeries.winner === team.teamId
                return (
                  <div key={label}>
                    {i > 0 && <div className="h-px bg-slate-800" />}
                    <div className={`flex items-center gap-2 px-2 py-1.5 ${isWinner ? 'bg-green-950/30' : ''}`}>
                      <span className="text-[9px] font-bold text-slate-600 w-5 shrink-0">{label}</span>
                      {team ? (
                        <>
                          <TeamLogo teamId={team.teamId} size={14} />
                          <span className={`text-[11px] font-medium flex-1 truncate max-w-[80px] ${isWinner ? 'text-green-400' : 'text-slate-300'}`}>
                            {team.teamName?.split(' ').pop()}
                          </span>
                          {wins !== null && <span className={`text-[10px] font-bold tabular-nums shrink-0 ${isWinner ? 'text-green-400' : 'text-slate-500'}`}>{wins}</span>}
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-600">TBD</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'queue',     label: 'My Queue'  },
  { id: 'all',       label: 'All Games' },
  { id: 'watched',   label: 'Watched'   },
  { id: 'standings', label: 'Standings' },
  { id: 'playoffs',  label: 'Playoffs'  },
  { id: 'stats',     label: 'Stats'     },
]

export default function MLBView() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('queue')

  useEffect(() => {
    fetchMLBGames()
      .then(setGames)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 md:p-6">
      {/* Header with team logo */}
      <div className="flex items-center gap-4 mb-7">
        <img
          src="https://www.mlbstatic.com/team-logos/119.svg"
          alt="LA Dodgers"
          width={72}
          height={72}
          className="rounded-full object-contain bg-blue-950/40 border border-blue-900/40 p-1.5 shrink-0"
        />
        <div>
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">MLB · Dodgers</h2>
          <p className="text-sm text-slate-500 mt-0.5">LA Dodgers regular season + all playoffs</p>
        </div>
      </div>

      {/* Tab bar — underline active style */}
      <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
            }`}
            style={tab === t.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner message="Loading MLB games..." />}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">
          Failed to load: {error}
        </div>
      )}

      {!loading && !error && tab === 'queue'     && <QueueTab games={games} />}
      {!loading && !error && tab === 'all'       && <AllGamesTab games={games} />}
      {!loading && !error && tab === 'watched'   && <WatchedTab games={games} />}
      {tab === 'standings' && <StandingsTab games={games} />}
      {tab === 'playoffs'  && <MLBBracketTab games={games} />}
      {tab === 'stats'     && <StatsTab />}
    </div>
  )
}
