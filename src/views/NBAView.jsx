import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchNBAGames, fetchNBAStandings, fetchNBAStatsFromWatchedGames } from '../api/espn'
import GameCard from '../components/GameCard'
import SeasonStatsPanel from '../components/SeasonStatsPanel'
import { NBAScorerCard, NBARebounderCard, NBAAssistCard } from '../components/PlayerStatCard'
import SeasonFilter from '../components/SeasonFilter'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useWatched } from '../contexts/WatchedContext'
import { getSeasonYear, getAvailableSeasons } from '../utils/season'

const LAKERS_ID = '13'

function computeNBASeries(games, teamAId, teamBId, winsNeeded, isProcessed) {
  if (!teamAId || !teamBId) return { winsA: 0, winsB: 0, hasGames: false, winner: null }
  const seriesGames = games.filter(g =>
    g.status === 'final' &&
    g.gameType !== 'Regular Season' &&
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

function buildNBABracket(seeds, games, isProcessed) {
  if (!seeds || seeds.length < 8) return null
  const [s1, s2, s3, s4, s5, s6, s7, s8] = seeds
  // First Round: 1v8, 4v5, 2v7, 3v6 (BO7)
  const r1a = computeNBASeries(games, s1.teamId, s8.teamId, 4, isProcessed)
  const r1b = computeNBASeries(games, s4.teamId, s5.teamId, 4, isProcessed)
  const r1c = computeNBASeries(games, s2.teamId, s7.teamId, 4, isProcessed)
  const r1d = computeNBASeries(games, s3.teamId, s6.teamId, 4, isProcessed)
  const w1a = r1a.winner ? (r1a.winner === s1.teamId ? s1 : s8) : null
  const w1b = r1b.winner ? (r1b.winner === s4.teamId ? s4 : s5) : null
  const w1c = r1c.winner ? (r1c.winner === s2.teamId ? s2 : s7) : null
  const w1d = r1d.winner ? (r1d.winner === s3.teamId ? s3 : s6) : null
  // Conf Semis: top-half winner vs top-half winner (BO7)
  const r2a = computeNBASeries(games, w1a?.teamId ?? null, w1b?.teamId ?? null, 4, isProcessed)
  const r2b = computeNBASeries(games, w1c?.teamId ?? null, w1d?.teamId ?? null, 4, isProcessed)
  const w2a = r2a.winner ? (r2a.winner === w1a?.teamId ? w1a : w1b) : null
  const w2b = r2b.winner ? (r2b.winner === w1c?.teamId ? w1c : w1d) : null
  // Conf Finals (BO7)
  const r3 = computeNBASeries(games, w2a?.teamId ?? null, w2b?.teamId ?? null, 4, isProcessed)
  const confChamp = r3.winner ? (r3.winner === w2a?.teamId ? w2a : w2b) : null
  return { s1, s2, s3, s4, s5, s6, s7, s8, r1a, r1b, r1c, r1d, w1a, w1b, w1c, w1d, r2a, r2b, w2a, w2b, r3, confChamp }
}

// Correct seeds 5-8 using actual first-round playoff matchups (handles play-in swaps and tiebreakers)
function adjustSeedsFromBracket(seeds, games, confTeamIds) {
  const [s1, s2, s3, s4] = seeds
  if (!s1 || !s2 || !s3 || !s4) return seeds

  const confPlayoffGames = games.filter(g =>
    g.gameType !== 'Regular Season' && g.gameType !== 'Play-In' &&
    confTeamIds.has(g.homeTeam.id) && confTeamIds.has(g.awayTeam.id)
  )
  if (!confPlayoffGames.length) return seeds

  const top4Ids = new Set([s1.teamId, s2.teamId, s3.teamId, s4.teamId])

  const getOpponent = (seedId) => {
    const g = confPlayoffGames.find(x =>
      (x.homeTeam.id === seedId || x.awayTeam.id === seedId) &&
      !top4Ids.has(x.homeTeam.id === seedId ? x.awayTeam.id : x.homeTeam.id)
    )
    return g ? (g.homeTeam.id === seedId ? g.awayTeam.id : g.homeTeam.id) : null
  }

  const actual8Id = getOpponent(s1.teamId)
  const actual7Id = getOpponent(s2.teamId)
  const actual6Id = getOpponent(s3.teamId)
  const actual5Id = getOpponent(s4.teamId)

  if (!actual5Id || !actual6Id || !actual7Id || !actual8Id) return seeds

  const getTeamObj = (teamId) => {
    const existing = seeds.find(s => s.teamId === teamId)
    if (existing) return existing
    for (const g of games) {
      if (g.homeTeam.id === teamId)
        return { teamId, teamName: g.homeTeam.name, abbreviation: g.homeTeam.abbreviation, logo: g.homeTeam.logo }
      if (g.awayTeam.id === teamId)
        return { teamId, teamName: g.awayTeam.name, abbreviation: g.awayTeam.abbreviation, logo: g.awayTeam.logo }
    }
    return null
  }

  const t5 = getTeamObj(actual5Id)
  const t6 = getTeamObj(actual6Id)
  const t7 = getTeamObj(actual7Id)
  const t8 = getTeamObj(actual8Id)

  if (!t5 || !t6 || !t7 || !t8) return seeds
  return [s1, s2, s3, s4, { ...t5, seed: 5 }, { ...t6, seed: 6 }, { ...t7, seed: 7 }, { ...t8, seed: 8 }]
}

// ─── My Queue ─────────────────────────────────────────────────────────────────

function QueueTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showWatched, setShowWatched] = useState(false)

  const { upNext, unwatched, watched } = useMemo(() => {
    const live = games.filter(g => g.status === 'live' && !isDismissed(g.id, 'nba'))
    const finalUnwatched = games
      .filter(g => g.status === 'final' && !isWatched(g.id, 'nba') && !isDismissed(g.id, 'nba'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const scheduled = games
      .filter(g => g.status === 'scheduled' && !isDismissed(g.id, 'nba'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const watchedList = games
      .filter(g => isWatched(g.id, 'nba'))
      .sort((a, b) => b.gameDate - a.gameDate)

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
        <EmptyState emoji="🏀" title="No games yet" message="Check back once the season starts." />
      )}

      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameCard game={upNext} isUpNext showDismissAction trackedTeamId={LAKERS_ID} />
            <SeasonStatsPanel league="nba" trackedTeamId={LAKERS_ID} />
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
        {unwatched.map(g => <GameCard key={g.id} game={g} showDismissAction trackedTeamId={LAKERS_ID} />)}
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
              {watched.map(g => <GameCard key={g.id} game={g} trackedTeamId={LAKERS_ID} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── All Games ────────────────────────────────────────────────────────────────

const GAME_FILTERS = [
  { id: 'all',      label: 'All'            },
  { id: 'playoffs', label: 'Playoffs'       },
  { id: 'regular',  label: 'Regular Season' },
]

function AllGamesTab({ games }) {
  const [filter, setFilter] = useState('all')
  const filtered = useMemo(() => {
    const sorted = [...games].sort((a, b) => b.gameDate - a.gameDate)
    if (filter === 'playoffs') return sorted.filter(g => g.gameType === 'Playoffs' || g.gameType === 'Play-In' || g.gameType?.toLowerCase().includes('playoff'))
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
        {filtered.map(g => <GameCard key={g.id} game={g} trackedTeamId={LAKERS_ID} />)}
      </div>
    </>
  )
}

// ─── Watched ──────────────────────────────────────────────────────────────────

function getResult(game) {
  if (game.homeScore === null || game.awayScore === null) return null
  if (!game.lakersTeam) return null
  const lakersScore = game.lakersTeam === 'home' ? game.homeScore : game.awayScore
  const oppScore    = game.lakersTeam === 'home' ? game.awayScore : game.homeScore
  return lakersScore > oppScore ? 'win' : lakersScore < oppScore ? 'loss' : null
}

function WatchedTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showSkipped, setShowSkipped] = useState(false)

  const watched = games
    .filter(g => isWatched(g.id, 'nba'))
    .sort((a, b) => b.gameDate - a.gameDate)

  const skipped = games
    .filter(g => isDismissed(g.id, 'nba'))
    .sort((a, b) => b.gameDate - a.gameDate)

  if (watched.length === 0 && skipped.length === 0) {
    return (
      <EmptyState emoji="🏀" title="No watched games yet"
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
            {watched.map(g => <GameCard key={g.id} game={g} resultColor={getResult(g)} trackedTeamId={LAKERS_ID} />)}
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
              {skipped.map(g => <GameCard key={g.id} game={g} showDismissAction />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Standings ────────────────────────────────────────────────────────────────

function NBATeamLogo({ src, name, size = 20 }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-400 shrink-0"
        style={{ width: size, height: size }}>
        {name?.slice(0, 3)}
      </div>
    )
  }
  return (
    <img src={src} alt={name} width={size} height={size}
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
            const isLakers = team.teamId === LAKERS_ID
            const rec = vsMap[team.teamId] ?? { w: 0, l: 0 }
            const hasFaced = rec.w > 0 || rec.l > 0
            return (
              <tr key={team.teamId}
                className={`border-t border-slate-800/60 ${isLakers ? 'bg-purple-950/20' : i % 2 === 0 ? 'bg-[#161622]' : 'bg-[#131320]'}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <NBATeamLogo src={team.logo} name={team.abbreviation} size={20} />
                    <span className={`text-xs font-medium ${isLakers ? 'text-purple-400' : 'text-slate-300'}`}>
                      {team.teamName.split(' ').pop()}
                    </span>
                    {isLakers && <span className="text-[10px] text-purple-600 hidden sm:inline">(you)</span>}
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
  const isLakers = !isPlaceholder && seed?.teamId === LAKERS_ID
  const name = isPlaceholder ? (seed?.label ?? 'TBD') : (seed?.teamName?.split(' ').pop() ?? '?')
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1.5 ${
      isWinner ? 'bg-green-950/30' : isLakers ? 'bg-purple-950/30' : ''
    }`}>
      <span className="text-[9px] font-bold tabular-nums text-slate-600 w-3 shrink-0">
        {isPlaceholder ? '?' : seed?.seed}
      </span>
      {!isPlaceholder && seed?.logo
        ? <NBATeamLogo src={seed.logo} name={seed.abbreviation} size={14} />
        : <div className="w-3.5 h-3.5 rounded-full bg-slate-800 shrink-0" />
      }
      <span className={`text-[11px] font-medium flex-1 max-w-[66px] truncate ${
        isWinner ? 'text-green-400' : isLakers ? 'text-purple-400' : isPlaceholder ? 'text-slate-600' : 'text-slate-300'
      }`}>{name}</span>
      {wins !== null && !isPlaceholder && (
        <span className={`text-[10px] font-bold tabular-nums shrink-0 ml-0.5 ${isWinner ? 'text-green-400' : 'text-slate-500'}`}>
          {wins}
        </span>
      )}
      {!isPlaceholder && !isWinner && seed?.seed >= 7 && (
        <span className="text-[8px] text-slate-600 shrink-0">PI</span>
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

function NBAPlayoffBracket({ title, bracket }) {
  if (!bracket) return null
  const { s1, s2, s3, s4, s5, s6, s7, s8, r1a, r1b, r1c, r1d, w1a, w1b, w1c, w1d, r2a, r2b, w2a, w2b, r3 } = bracket

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f0f1a] p-4">
      <p className="text-xs font-semibold text-slate-300 mb-4">{title}</p>
      <div className="flex items-start gap-3 overflow-x-auto pb-2">

        <div className="flex flex-col gap-2 shrink-0">
          <p className="text-[9px] text-slate-600 uppercase tracking-widest">First Round</p>
          <BracketMatchup top={s1} bottom={s8}
            winsTop={r1a.hasGames ? r1a.winsA : null} winsBottom={r1a.hasGames ? r1a.winsB : null}
            winnerId={r1a.winner} />
          <BracketMatchup top={s4} bottom={s5}
            winsTop={r1b.hasGames ? r1b.winsA : null} winsBottom={r1b.hasGames ? r1b.winsB : null}
            winnerId={r1b.winner} />
          <BracketMatchup top={s2} bottom={s7}
            winsTop={r1c.hasGames ? r1c.winsA : null} winsBottom={r1c.hasGames ? r1c.winsB : null}
            winnerId={r1c.winner} />
          <BracketMatchup top={s3} bottom={s6}
            winsTop={r1d.hasGames ? r1d.winsA : null} winsBottom={r1d.hasGames ? r1d.winsB : null}
            winnerId={r1d.winner} />
        </div>

        <div className="text-slate-700 mt-16 shrink-0">›</div>

        <div className="flex flex-col gap-2 shrink-0">
          <p className="text-[9px] text-slate-600 uppercase tracking-widest">Conf Semis</p>
          <BracketMatchup top={w1a} bottom={w1b}
            winsTop={r2a.hasGames ? r2a.winsA : null} winsBottom={r2a.hasGames ? r2a.winsB : null}
            winnerId={r2a.winner} topPlaceholder={!w1a} bottomPlaceholder={!w1b} />
          <BracketMatchup top={w1c} bottom={w1d}
            winsTop={r2b.hasGames ? r2b.winsA : null} winsBottom={r2b.hasGames ? r2b.winsB : null}
            winnerId={r2b.winner} topPlaceholder={!w1c} bottomPlaceholder={!w1d} />
        </div>

        <div className="text-slate-700 mt-16 shrink-0">›</div>

        <div className="flex flex-col gap-2 shrink-0">
          <p className="text-[9px] text-slate-600 uppercase tracking-widest">Conf Finals</p>
          <BracketMatchup top={w2a} bottom={w2b}
            winsTop={r3.hasGames ? r3.winsA : null} winsBottom={r3.hasGames ? r3.winsB : null}
            winnerId={r3.winner} topPlaceholder={!w2a} bottomPlaceholder={!w2b} />
        </div>

      </div>
      <p className="text-[9px] text-slate-700 mt-2">PI = Play-In · bracket updates as you watch playoff games</p>
    </div>
  )
}

function StandingsTab() {
  const { watchedGames } = useWatched()
  const [standings, setStandings] = useState(null)
  const [standingsLoading, setStandingsLoading] = useState(true)
  const [seasonFilter, setSeasonFilter] = useState('all')

  const availableSeasons = useMemo(
    () => getAvailableSeasons(watchedGames, 'nba'),
    [watchedGames]
  )

  useEffect(() => {
    fetchNBAStandings()
      .then(setStandings)
      .catch(console.error)
      .finally(() => setStandingsLoading(false))
  }, [])

  const vsMap = useMemo(() => {
    const map = {}
    Object.values(watchedGames).forEach(g => {
      if (g.league !== 'nba' || !g.watched) return
      if (g.homeScore === null || g.awayScore === null) return
      if (seasonFilter !== 'all' && getSeasonYear('nba', g.gameDate) !== seasonFilter) return
      const isLakersHome = g.homeTeamId === LAKERS_ID
      const isLakersAway = g.awayTeamId === LAKERS_ID
      if (!isLakersHome && !isLakersAway) return
      const lakersScore = isLakersHome ? g.homeScore : g.awayScore
      const oppScore    = isLakersHome ? g.awayScore : g.homeScore
      const oppId       = isLakersHome ? g.awayTeamId : g.homeTeamId
      if (!map[oppId]) map[oppId] = { w: 0, l: 0 }
      if (lakersScore > oppScore) map[oppId].w++
      else if (oppScore > lakersScore) map[oppId].l++
    })
    return map
  }, [watchedGames, seasonFilter])

  if (standingsLoading) return <LoadingSpinner message="Loading standings..." />
  if (!standings) return <p className="text-sm text-slate-600">Standings unavailable.</p>

  const eastDivisions = standings.divisions.filter(d => d.league === 'East')
  const westDivisions = standings.divisions.filter(d => d.league === 'West')

  return (
    <div className="flex flex-col gap-8">

      <SeasonFilter league="nba" seasons={availableSeasons} selected={seasonFilter} onChange={setSeasonFilter} />

      {[
        { label: 'Eastern Conference', divisions: eastDivisions },
        { label: 'Western Conference', divisions: westDivisions },
      ].map(({ label, divisions }) => (
        <section key={label}>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{label}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {divisions.map(div => <DivisionTable key={div.id} division={div} vsMap={vsMap} />)}
          </div>
          <p className="text-[10px] text-slate-700 mt-2">Order = real-life standings · W/L = Lakers head-to-head from your watched games</p>
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

  const nbaWatched = useMemo(
    () => Object.values(watchedGames).filter(g => g.league === 'nba' && g.watched),
    [watchedGames]
  )

  const availableSeasons = useMemo(
    () => getAvailableSeasons(watchedGames, 'nba'),
    [watchedGames]
  )

  const filteredWatched = useMemo(
    () => seasonFilter === 'all'
      ? nbaWatched
      : nbaWatched.filter(g => getSeasonYear('nba', g.gameDate) === seasonFilter),
    [nbaWatched, seasonFilter]
  )

  useEffect(() => {
    if (!filteredWatched.length) { setStats(null); return }
    setLoading(true)
    setError(null)
    fetchNBAStatsFromWatchedGames(filteredWatched)
      .then(setStats)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [filteredWatched.length, seasonFilter])

  if (!nbaWatched.length) return (
    <EmptyState emoji="📊" title="No watched games yet"
      message="Mark games as watched in My Queue — stats will be computed from only those games." />
  )

  if (loading) return <LoadingSpinner message={`Fetching stats from ${filteredWatched.length} watched game${filteredWatched.length !== 1 ? 's' : ''}…`} />

  if (error) return (
    <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">
      Failed to load stats: {error}
    </div>
  )

  const noData = !stats || (!stats.ptsLeaders?.length && !stats.rebLeaders?.length)
  if (noData) return (
    <EmptyState emoji="📊" title="Not enough data yet"
      message="Watch a few more games — players need consistent appearances to show up here." />
  )

  return (
    <div className="flex flex-col gap-7">
      <SeasonFilter league="nba" seasons={availableSeasons} selected={seasonFilter} onChange={setSeasonFilter} />
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Stats from <span className="text-slate-300 font-medium">{stats.gameCount}</span> watched game{stats.gameCount !== 1 ? 's' : ''} · per-game averages
        </p>
        <div className="flex gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Elite</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Solid</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Avg</span>
        </div>
      </div>

      {stats.ptsLeaders?.length > 0 && (
        <StatSection title="Points" sub="≥25 elite · ≥18 solid">
          {stats.ptsLeaders.map((p, i) => <NBAScorerCard key={p.id} player={p} rank={i} />)}
        </StatSection>
      )}

      {stats.rebLeaders?.length > 0 && (
        <StatSection title="Rebounds" sub="≥10 elite · ≥7 solid">
          {stats.rebLeaders.map((p, i) => <NBARebounderCard key={p.id} player={p} rank={i} />)}
        </StatSection>
      )}

      {stats.astLeaders?.length > 0 && (
        <StatSection title="Assists" sub="≥8 elite · ≥5 solid">
          {stats.astLeaders.map((p, i) => <NBAAssistCard key={p.id} player={p} rank={i} />)}
        </StatSection>
      )}
    </div>
  )
}

// ─── Playoffs ─────────────────────────────────────────────────────────────────

function NBABracketTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [standings, setStandings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNBAStandings().then(setStandings).catch(console.error).finally(() => setLoading(false))
  }, [])

  const isProcessed = useCallback(id => isWatched(id, 'nba') || isDismissed(id, 'nba'), [isWatched, isDismissed])

  const eastTeamIds = useMemo(() => new Set(
    (standings?.divisions || [])
      .filter(d => d.league === 'East')
      .flatMap(d => d.teams.map(t => t.teamId))
  ), [standings])

  const westTeamIds = useMemo(() => new Set(
    (standings?.divisions || [])
      .filter(d => d.league === 'West')
      .flatMap(d => d.teams.map(t => t.teamId))
  ), [standings])

  const eastSeeds = useMemo(() =>
    standings ? adjustSeedsFromBracket(standings.eastSeeds, games, eastTeamIds) : null,
    [standings, games, eastTeamIds])

  const westSeeds = useMemo(() =>
    standings ? adjustSeedsFromBracket(standings.westSeeds, games, westTeamIds) : null,
    [standings, games, westTeamIds])

  const eastBracket = useMemo(() =>
    eastSeeds ? buildNBABracket(eastSeeds, games, isProcessed) : null,
    [eastSeeds, games, isProcessed])

  const westBracket = useMemo(() =>
    westSeeds ? buildNBABracket(westSeeds, games, isProcessed) : null,
    [westSeeds, games, isProcessed])

  const eastChamp = eastBracket?.confChamp
  const westChamp = westBracket?.confChamp

  const finalsSeries = useMemo(() => {
    if (!eastChamp || !westChamp) return null
    return computeNBASeries(games, eastChamp.teamId, westChamp.teamId, 4, isProcessed)
  }, [games, eastChamp, westChamp, isProcessed])

  if (loading) return <LoadingSpinner message="Loading bracket..." />
  if (!standings) return <p className="text-sm text-slate-600">Bracket unavailable.</p>

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">Bracket updates as you watch or skip playoff games · PI = Play-In</p>
      <NBAPlayoffBracket title="Eastern Conference" bracket={eastBracket} />
      <NBAPlayoffBracket title="Western Conference" bracket={westBracket} />
      {(eastChamp || westChamp) && (
        <div className="rounded-xl border border-slate-800 bg-[#0f0f1a] p-4">
          <p className="text-xs font-semibold text-slate-300 mb-4">NBA Finals</p>
          <div className="flex justify-center">
            <div className={`rounded-lg border overflow-hidden min-w-[140px] ${finalsSeries?.winner ? 'border-green-900/40' : 'border-slate-700/60'}`}>
              {[
                { label: 'East', team: eastChamp, wins: finalsSeries?.hasGames ? finalsSeries.winsA : null },
                { label: 'West', team: westChamp, wins: finalsSeries?.hasGames ? finalsSeries.winsB : null },
              ].map(({ label, team, wins }, i) => {
                const isWinner = !!finalsSeries?.winner && team && finalsSeries.winner === team.teamId
                return (
                  <div key={label}>
                    {i > 0 && <div className="h-px bg-slate-800" />}
                    <div className={`flex items-center gap-2 px-2 py-1.5 ${isWinner ? 'bg-green-950/30' : ''}`}>
                      <span className="text-[9px] font-bold text-slate-600 w-7 shrink-0">{label}</span>
                      {team ? (
                        <>
                          <NBATeamLogo src={team.logo} name={team.abbreviation} size={14} />
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

export default function NBAView() {
  const [games, setGames]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [tab, setTab]       = useState('queue')

  useEffect(() => {
    fetchNBAGames()
      .then(setGames)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-4 mb-7">
        <img
          src="https://a.espncdn.com/i/teamlogos/nba/500/lal.png"
          alt="LA Lakers"
          width={72} height={72}
          className="rounded-full object-contain bg-purple-950/40 border border-purple-900/40 p-1.5 shrink-0"
        />
        <div>
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">NBA · Lakers</h2>
          <p className="text-sm text-slate-500 mt-0.5">LA Lakers regular season + all playoffs</p>
        </div>
      </div>

      <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            style={tab === t.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
            {t.label}
            {tab === t.id && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-blue-500 rounded-full" />}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner message="Loading NBA games..." />}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">
          Failed to load: {error}
        </div>
      )}

      {!loading && !error && tab === 'queue'     && <QueueTab games={games} />}
      {!loading && !error && tab === 'all'       && <AllGamesTab games={games} />}
      {!loading && !error && tab === 'watched'   && <WatchedTab games={games} />}
      {tab === 'standings' && <StandingsTab games={games} />}
      {tab === 'playoffs'  && <NBABracketTab games={games} />}
      {tab === 'stats'     && <StatsTab />}
    </div>
  )
}
