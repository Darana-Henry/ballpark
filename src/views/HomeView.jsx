import { useState, useEffect, useMemo } from 'react'
import { fetchMLBGames } from '../api/mlb'
import { fetchNBAGames, fetchNFLGames } from '../api/espn'
import { fetchMLSGames } from '../api/mls'
import { fetchBBLGames } from '../api/bbl'
import GameCard from '../components/GameCard'
import BoundaryTracker from '../components/BoundaryTracker'
import { useWatched } from '../contexts/WatchedContext'
import { LEAGUE_MAP } from '../constants/leagues'

const ENV_BBL_KEY = import.meta.env.VITE_CRICAPI_KEY || ''

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAGUE_LABELS = {
  mlb: 'MLB · Dodgers',
  nba: 'NBA · Lakers',
  nfl: 'NFL',
  mls: 'MLS · Inter Miami',
  bbl: 'BBL',
}

const LEAGUE_COLORS = {
  mlb: 'text-blue-400',
  nba: 'text-purple-400',
  nfl: 'text-emerald-400',
  mls: 'text-pink-400',
  bbl: 'text-amber-400',
}

const LEAGUE_DOT_BG = {
  mlb: 'bg-blue-500',
  nba: 'bg-purple-500',
  nfl: 'bg-emerald-500',
  mls: 'bg-pink-500',
  bbl: 'bg-amber-500',
}

const LEAGUE_BORDER = {
  mlb: 'border-l-blue-500',
  nba: 'border-l-purple-500',
  nfl: 'border-l-emerald-500',
  mls: 'border-l-pink-500',
  bbl: 'border-l-amber-500',
}

const TRACKED_TEAM = { mlb: '119', nba: '13', mls: '20232' }
const FETCH_ORDER  = ['mlb', 'nba', 'mls', 'nfl']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUpNext(games, league, isWatched, isDismissed) {
  const live = games.filter(g => g.status === 'live' && !isDismissed(g.id, league))
  const finalUnwatched = games
    .filter(g => g.status === 'final' && !isWatched(g.id, league) && !isDismissed(g.id, league))
    .sort((a, b) => a.gameDate - b.gameDate)
  const scheduled = games
    .filter(g => g.status === 'scheduled' && !isDismissed(g.id, league))
    .sort((a, b) => a.gameDate - b.gameDate)
  return finalUnwatched[0] ?? live[0] ?? scheduled[0] ?? null
}

function getThisWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const daysFromMon = day === 0 ? 6 : day - 1
  const mon = new Date(now)
  mon.setDate(now.getDate() - daysFromMon)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return { mon, sun }
}

function getWeeklyResult(g) {
  const trackedId = TRACKED_TEAM[g.league]
  if (!trackedId) return null
  if (g.homeScore === null || g.awayScore === null) return null
  const isHome = g.homeTeamId === trackedId
  const isAway = g.awayTeamId === trackedId
  if (!isHome && !isAway) return null
  const ts = isHome ? g.homeScore : g.awayScore
  const os = isHome ? g.awayScore  : g.homeScore
  return ts > os ? 'win' : ts < os ? 'loss' : 'draw'
}

function logoUrl(league, teamId) {
  if (!teamId) return null
  if (league === 'mlb') return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
  if (league === 'nba') return `https://a.espncdn.com/i/teamlogos/nba/500/${teamId}.png`
  if (league === 'nfl') return `https://a.espncdn.com/i/teamlogos/nfl/500/${teamId}.png`
  if (league === 'mls') return `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
  return null
}

// ─── Weekly stats panel (right half of hero) ──────────────────────────────────

function WeeklyStatsPanel({ items }) {
  const wins   = items.filter(i => i.result === 'win').length
  const draws  = items.filter(i => i.result === 'draw').length
  const losses = items.filter(i => i.result === 'loss').length
  const noRes  = items.filter(i => i.result === null).length

  const { mon, sun } = getThisWeekRange()
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div
      className="rounded-2xl p-5 flex flex-col h-full"
      style={{
        background: 'linear-gradient(140deg, rgba(15,20,50,0.92) 0%, rgba(8,10,28,0.96) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-auto">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">This Week</p>
          <p className="text-xs text-slate-600">{fmt(mon)} – {fmt(sun)}</p>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">{items.length} watched</span>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-600 text-sm text-center">No games watched yet this week</p>
        </div>
      ) : (
        <>
          {/* Big W / D / L */}
          <div className="flex items-end justify-evenly mt-6 mb-5">
            <div className="flex-1 text-center">
              <p className="text-6xl font-bold text-green-400 leading-none tabular-nums">{wins}</p>
              <p className="text-[9px] font-bold text-green-700 uppercase tracking-widest mt-2">Win</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-6xl font-bold text-slate-500 leading-none tabular-nums">{draws}</p>
              <p className="text-[9px] font-bold text-slate-700 uppercase tracking-widest mt-2">Draw</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-6xl font-bold text-red-400 leading-none tabular-nums">{losses}</p>
              <p className="text-[9px] font-bold text-red-800 uppercase tracking-widest mt-2">Loss</p>
            </div>
            {noRes > 0 && (
              <div className="flex-1 text-center">
                <p className="text-6xl font-bold text-slate-700 leading-none tabular-nums">{noRes}</p>
                <p className="text-[9px] font-bold text-slate-700 uppercase tracking-widest mt-2">Watched</p>
              </div>
            )}
          </div>

          {/* Form strip */}
          <div className="flex items-center gap-2 mt-auto">
            <p className="text-[9px] text-slate-700 uppercase tracking-widest shrink-0">Form</p>
            <div className="flex gap-1.5">
              {items.slice(-10).map((item, i) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full ${
                  item.result === 'win'  ? 'bg-green-500' :
                  item.result === 'loss' ? 'bg-red-500'   :
                  item.result === 'draw' ? 'bg-slate-500' : 'bg-slate-700'
                }`} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── League badge chip ────────────────────────────────────────────────────────

function LeagueBadge({ league }) {
  return (
    <div className="flex items-center gap-1.5 px-1 mb-1.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEAGUE_DOT_BG[league] ?? 'bg-slate-500'}`} />
      <span className={`text-[9px] font-bold uppercase tracking-widest ${LEAGUE_COLORS[league] ?? 'text-slate-500'}`}>
        {LEAGUE_LABELS[league] ?? league.toUpperCase()}
      </span>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 h-full animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="h-3 w-24 rounded bg-slate-700/60 mb-4" />
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-slate-700/60 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-32 rounded bg-slate-700/60" />
          <div className="h-2 w-16 rounded bg-slate-700/40" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-700/60 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-28 rounded bg-slate-700/60" />
          <div className="h-2 w-16 rounded bg-slate-700/40" />
        </div>
      </div>
    </div>
  )
}

// ─── Scrolling ticker ─────────────────────────────────────────────────────────

function TickerTeamLogo({ src, alt }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[7px] font-bold text-slate-400 shrink-0">
        {(alt?.split(' ').pop() ?? '?').slice(0, 2)}
      </div>
    )
  }
  return (
    <img src={src} alt={alt} width={20} height={20}
      className="w-5 h-5 rounded-full object-contain bg-slate-800/60 p-0.5 shrink-0"
      onError={() => setErr(true)} />
  )
}

function TickerItem({ item }) {
  const { game, league, result } = item

  const resultColor = result === 'win'  ? '#4ade80' :
                      result === 'loss' ? '#f87171' :
                      result === 'draw' ? '#94a3b8'  : '#64748b'
  const resultLabel = result === 'win' ? 'W' : result === 'loss' ? 'L' : result === 'draw' ? 'D' : '●'

  const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0)
  const awayWon = (game.awayScore ?? 0) > (game.homeScore ?? 0)

  const dayLabel = game.gameDate
    ? game.gameDate.toLocaleDateString('en-US', { weekday: 'short' })
    : ''

  const shortName = n => n?.split(' ').pop() ?? n ?? '?'

  return (
    <div className="flex items-center gap-2.5 px-4 py-2 shrink-0 select-none"
      style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
      {/* League dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEAGUE_DOT_BG[league] ?? 'bg-slate-600'}`} />

      {/* Away */}
      <TickerTeamLogo src={game.awayLogo} alt={game.awayName} />
      <span className={`text-xs font-semibold tabular-nums ${awayWon ? 'text-slate-100' : 'text-slate-500'}`}>
        {shortName(game.awayName)}
      </span>
      <span className={`text-sm font-bold tabular-nums ${awayWon ? 'text-slate-100' : 'text-slate-500'}`}>
        {game.awayScore ?? '–'}
      </span>

      <span className="text-slate-700 text-xs">·</span>

      {/* Home */}
      <span className={`text-sm font-bold tabular-nums ${homeWon ? 'text-slate-100' : 'text-slate-500'}`}>
        {game.homeScore ?? '–'}
      </span>
      <span className={`text-xs font-semibold tabular-nums ${homeWon ? 'text-slate-100' : 'text-slate-500'}`}>
        {shortName(game.homeName)}
      </span>
      <TickerTeamLogo src={game.homeLogo} alt={game.homeName} />

      {/* Result + day */}
      <span className="text-xs font-bold ml-1" style={{ color: resultColor }}>{resultLabel}</span>
      <span className="text-[10px] text-slate-600">{dayLabel}</span>
    </div>
  )
}

function Ticker({ league, items }) {
  if (!items.length) return null
  const duration = Math.max(items.length * 6, 20)
  const doubled  = [...items, ...items]

  return (
    <div className="flex items-center gap-3">
      {/* League label — left of the ticker */}
      <span className={`text-[9px] font-bold uppercase tracking-widest shrink-0 w-7 ${LEAGUE_COLORS[league] ?? 'text-slate-500'}`}>
        {league.toUpperCase()}
      </span>

      {/* Scrolling strip */}
      <div
        className="relative overflow-hidden rounded-lg flex-1 py-0.5"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          maskImage: 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)',
        }}
      >
        <div
          className="ticker-track flex"
          style={{ animationDuration: `${duration}s` }}
        >
          {doubled.map((item, i) => <TickerItem key={i} item={item} />)}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HomeView() {
  const { isWatched, isDismissed, watchedGames } = useWatched()
  const [trackedGame, setTrackedGame] = useState(null)

  const [states, setStates] = useState(() => {
    const hasBBL = !!(ENV_BBL_KEY || localStorage.getItem('cricapi_key'))
    const ids = [...FETCH_ORDER, ...(hasBBL ? ['bbl'] : [])]
    return Object.fromEntries(ids.map(id => [id, { games: [], loading: true, error: null }]))
  })

  useEffect(() => {
    function load(id, promise) {
      promise
        .then(result => {
          const games = Array.isArray(result) ? result : (result?.games ?? [])
          setStates(s => ({ ...s, [id]: { games, loading: false, error: null } }))
        })
        .catch(err  => setStates(s => ({ ...s, [id]: { games: [], loading: false, error: err.message } })))
    }
    load('mlb', fetchMLBGames())
    load('nba', fetchNBAGames())
    load('nfl', fetchNFLGames())
    load('mls', fetchMLSGames())
    const bblKey = ENV_BBL_KEY || localStorage.getItem('cricapi_key')
    if (bblKey) load('bbl', fetchBBLGames(bblKey))
  }, [])

  // One card per league, sorted by game date
  const cards = useMemo(() =>
    Object.entries(states)
      .map(([league, { games }]) => {
        if (!games.length) return null
        const game = getUpNext(games, league, isWatched, isDismissed)
        if (!game) return null
        return { game, league, trackedTeamId: LEAGUE_MAP[league]?.primaryTeamId ?? null }
      })
      .filter(Boolean)
      .sort((a, b) => a.game.gameDate - b.game.gameDate),
    [states, isWatched, isDismissed]
  )

  // Watched-this-week items for stats panel + ticker
  const weekItems = useMemo(() => {
    const { mon, sun } = getThisWeekRange()
    return Object.values(watchedGames)
      .filter(g => {
        if (!g.watched) return false
        const d = new Date(g.gameDate)
        return d >= mon && d <= sun
      })
      .map(g => ({
        game: {
          id: g.gameId,
          awayName:  g.awayTeam,
          homeName:  g.homeTeam,
          awayLogo:  logoUrl(g.league, g.awayTeamId),
          homeLogo:  logoUrl(g.league, g.homeTeamId),
          awayScore: g.awayScore,
          homeScore: g.homeScore,
          gameDate:  new Date(g.gameDate),
        },
        league: g.league,
        result: getWeeklyResult(g),
      }))
      .sort((a, b) => a.game.gameDate - b.game.gameDate)
  }, [watchedGames])

  const stillLoading = Object.entries(states).filter(([, s]) => s.loading).map(([id]) => id)
  const allLoading   = stillLoading.length === Object.keys(states).length
  const allDone      = stillLoading.length === 0

  const [hero, ...rest] = cards

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-100 leading-tight">Home</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {hero
            ? `Up next · ${LEAGUE_LABELS[hero.league] ?? hero.league.toUpperCase()}`
            : allLoading ? 'Loading leagues…' : 'All caught up'
          }
        </p>
      </div>

      {/* ── Split hero: left = next game, right = this week stats ─────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

        {/* Left — next game */}
        <div className="flex flex-col">
          {hero && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next</span>
              <span className="text-slate-700">·</span>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${LEAGUE_COLORS[hero.league] ?? 'text-slate-400'}`}>
                {LEAGUE_LABELS[hero.league]}
              </span>
            </div>
          )}
          {hero ? (
            <div className="relative">
              <GameCard
                game={hero.game}
                isUpNext
                showDismissAction
                trackedTeamId={hero.trackedTeamId}
              />
              {hero.league === 'bbl' && (
                <button
                  onClick={() => setTrackedGame(hero.game)}
                  className="absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg text-amber-400 z-10"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
                >
                  🏏 Track
                </button>
              )}
            </div>
          ) : allLoading ? (
            <div className="rounded-2xl h-56 animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
          ) : (
            <div className="rounded-2xl flex flex-col items-center justify-center h-56 gap-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="text-4xl">🏟️</span>
              <p className="text-slate-500 text-sm text-center">All caught up across every league</p>
            </div>
          )}
        </div>

        {/* Right — this week stats */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">This Week</span>
          </div>
          <WeeklyStatsPanel items={weekItems} />
        </div>

      </div>

      {/* ── Remaining league cards ────────────────────────────────────────── */}
      {(rest.length > 0 || (!allDone && stillLoading.some(id => id !== hero?.league))) && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 border-t border-white/[0.07]" />
            <span className="text-xs text-slate-600 shrink-0">
              {rest.length > 0
                ? `${rest.length} more across leagues`
                : 'Loading more…'}
            </span>
            <div className="flex-1 border-t border-white/[0.07]" />
          </div>

          {/* items-stretch + h-full on GameCard makes every card fill its row height */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 items-stretch mb-6">
            {rest.map(({ game, league, trackedTeamId }) => (
              <div key={game.id} className="flex flex-col h-full">
                <LeagueBadge league={league} />
                <div className="relative flex-1 flex flex-col">
                  <GameCard
                    game={game}
                    showDismissAction
                    trackedTeamId={trackedTeamId}
                    className="flex-1 h-full"
                  />
                  {league === 'bbl' && (
                    <button
                      onClick={() => setTrackedGame(game)}
                      className="absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg text-amber-400 z-10"
                      style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
                    >
                      🏏 Track
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!allDone && stillLoading
              .filter(id => id !== hero?.league && !rest.find(c => c.league === id))
              .map(id => (
                <div key={id} className="flex flex-col h-full">
                  <LeagueBadge league={id} />
                  <SkeletonCard />
                </div>
              ))
            }
          </div>
        </>
      )}

      {/* ── Per-league tickers (all except MLS) ──────────────────────────── */}
      {(() => {
        const TICKER_LEAGUES = ['mlb', 'nba', 'nfl', 'bbl']
        const byLeague = {}
        for (const id of TICKER_LEAGUES) {
          byLeague[id] = weekItems.filter(i => i.league === id)
        }
        const visible = TICKER_LEAGUES.filter(id => byLeague[id].length > 0)
        if (!visible.length) return null
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex-1 border-t border-white/[0.07]" />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest shrink-0">This Week</span>
              <div className="flex-1 border-t border-white/[0.07]" />
            </div>
            {visible.map(id => (
              <Ticker key={id} league={id} items={byLeague[id]} />
            ))}
          </div>
        )
      })()}

      {/* Still loading hint */}
      {!allLoading && !allDone && (
        <p className="text-[11px] text-slate-700 text-center mt-4">
          Loading {stillLoading.map(id => id.toUpperCase()).join(', ')}…
        </p>
      )}

      {trackedGame && (
        <BoundaryTracker game={trackedGame} onClose={() => setTrackedGame(null)} />
      )}
    </div>
  )
}
