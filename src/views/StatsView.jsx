import { useState } from 'react'
import { useWatched } from '../contexts/WatchedContext'
import { LEAGUES } from '../constants/leagues'
import { isFirebaseConfigured } from '../firebase'

const FEATURED_TEAM_IDS = {
  mlb: '119',
  nba: '13',
  nfl: null,
  bbl: null,
  mls: '20232',
  epl: '360',
}

function LeagueLogo({ league, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!league.logoUrl || err) {
    return (
      <div
        className={`rounded-full flex items-center justify-center text-sm shrink-0 ${league.iconBg}`}
        style={{ width: size, height: size }}
      >
        {league.emoji}
      </div>
    )
  }
  return (
    <img
      src={league.logoUrl}
      alt={league.name}
      width={size}
      height={size}
      className={`rounded-full object-contain p-0.5 shrink-0 ${league.iconBg}`}
      onError={() => setErr(true)}
    />
  )
}

function WinBar({ wins, losses, accentColor }) {
  const total = wins + losses
  if (total === 0) return null
  const pct = Math.round((wins / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: accentColor }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums text-slate-300 w-9 text-right">{pct}%</span>
    </div>
  )
}

function RecentGameRow({ game, league }) {
  const hasScore = game.homeScore !== null && game.awayScore !== null
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.05] last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: league.accentColor }} />
        <span className="text-xs text-slate-400 truncate">{game.awayTeam} @ {game.homeTeam}</span>
      </div>
      {hasScore && (
        <span
          className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md shrink-0"
          style={{
            background: `${league.accentColor}18`,
            color: league.accentColor,
            border: `1px solid ${league.accentColor}30`,
          }}
        >
          {game.awayScore}–{game.homeScore}
        </span>
      )}
    </div>
  )
}

function LeagueSection({ league }) {
  const { watchedForLeague } = useWatched()
  const watched = watchedForLeague(league.id)
  const finalGames = watched.filter(g => g.status === 'final' && g.homeScore !== null && g.awayScore !== null)

  let wins = 0, losses = 0
  const featuredId = FEATURED_TEAM_IDS[league.id]
  finalGames.forEach(g => {
    if (!featuredId) return
    const homeWon = g.homeScore > g.awayScore
    if (g.homeTeamId === featuredId) homeWon ? wins++ : losses++
    else if (g.awayTeamId === featuredId) homeWon ? losses++ : wins++
  })

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `4px solid ${league.accentColor}`,
      }}
    >
      {/* League header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
        <LeagueLogo league={league} size={36} />
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${league.textClass}`}>{league.name}</p>
          <p className="text-xs text-slate-600 truncate">{league.description}</p>
        </div>
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
          style={{
            background: `${league.accentColor}18`,
            color: league.accentColor,
            border: `1px solid ${league.accentColor}30`,
          }}
        >
          {watched.length} watched
        </span>
      </div>

      {watched.length === 0 ? (
        <p className="px-4 py-5 text-sm text-slate-600 text-center">No watched games yet.</p>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {/* W/L metrics */}
          {featuredId && wins + losses > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">Wins</p>
                  <p className={`text-xl font-bold tabular-nums ${league.textClass}`}>{wins}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">Losses</p>
                  <p className="text-xl font-bold tabular-nums text-slate-400">{losses}</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">Win %</p>
                  <p className={`text-xl font-bold tabular-nums ${league.textClass}`}>
                    {Math.round((wins / (wins + losses)) * 100)}%
                  </p>
                </div>
              </div>
              <WinBar wins={wins} losses={losses} accentColor={league.accentColor} />
            </>
          )}

          {/* Recent watched games */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">Recent Watched</p>
            <div>
              {watched.slice(0, 5).map(g => (
                <RecentGameRow key={`${g.league}_${g.gameId}`} game={g} league={league} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center shrink-0">
        {LEAGUES.slice(0, 4).map((l, i) => (
          <div
            key={l.id}
            className="rounded-full ring-2 ring-[#0d0d14]"
            style={{ marginLeft: i === 0 ? 0 : -10, zIndex: i }}
          >
            <LeagueLogo league={l} size={44} />
          </div>
        ))}
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-100 leading-tight">Stats</h2>
        <p className="text-sm text-slate-500 mt-0.5">From your watched games</p>
      </div>
    </div>
  )
}

export default function StatsView() {
  const { watchedGames } = useWatched()
  const totalWatched = Object.values(watchedGames).filter(g => g.watched).length

  if (!isFirebaseConfigured) {
    return (
      <div className="p-4 md:p-6">
        <Header />
        <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-6 text-center max-w-lg">
          <p className="text-amber-400 font-medium mb-2">Firebase not configured</p>
          <p className="text-sm text-slate-500">
            Connect Firebase to start tracking watched games and see your stats here.
            Edit <code className="text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded text-xs">src/firebase.js</code> with your credentials.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header + total hero side-by-side on wide screens */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
        <Header />
        <div
          className="rounded-2xl px-6 py-4 lg:shrink-0 lg:min-w-[200px]"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Total Watched</p>
          <p className="text-5xl font-bold text-slate-100 tabular-nums">{totalWatched}</p>
          <p className="text-sm text-slate-600 mt-1">across all leagues</p>
        </div>
      </div>

      {/* Per-league summary cards — all 6 in one row on xl */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
        {LEAGUES.map(league => {
          const count = Object.values(watchedGames).filter(g => g.league === league.id && g.watched).length
          return (
            <div
              key={league.id}
              className="rounded-xl p-4 relative overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div className="absolute top-3 right-3 opacity-15">
                <LeagueLogo league={league} size={38} />
              </div>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${league.textClass}`}>
                {league.name}
              </p>
              <p className="text-3xl font-bold text-slate-100 tabular-nums">{count}</p>
              <p className="text-xs text-slate-600 mt-0.5">watched</p>
            </div>
          )
        })}
      </div>

      {/* Per-league breakdown — 2 columns on lg+ */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Per League</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {LEAGUES.map(league => (
          <LeagueSection key={league.id} league={league} />
        ))}
      </div>
    </div>
  )
}
