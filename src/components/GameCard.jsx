import { useState } from 'react'
import { LEAGUE_MAP } from '../constants/leagues'
import { useWatched } from '../contexts/WatchedContext'
import { isFirebaseConfigured } from '../firebase'
import { useCountdown } from '../hooks/useCountdown'

function TeamLogo({ src, alt, size = 40 }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div
        className="rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0"
        style={{ width: size, height: size }}
      >
        {alt?.slice(0, 3)}
      </div>
    )
  }
  return (
    <img
      src={src} alt={alt} width={size} height={size}
      className="rounded-full object-contain bg-slate-800/50 p-0.5 shrink-0"
      onError={() => setErr(true)}
    />
  )
}

function RealLifeStatus({ status, detail }) {
  if (status === 'live') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 live-pulse" />
        LIVE{detail ? ` · ${detail}` : ''}
      </span>
    )
  }
  if (status === 'final') {
    const meaningful = detail && detail.toLowerCase() !== 'final'
    return (
      <span className={`text-xs font-semibold ${meaningful ? 'text-slate-300' : 'text-slate-400 uppercase tracking-wide'}`}>
        {meaningful ? detail : 'Final'}
      </span>
    )
  }
  return <span className="text-xs text-slate-500">{detail || 'Scheduled'}</span>
}

function formatGameDate(date) {
  if (!date) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const tom = new Date(now); tom.setDate(now.getDate() + 1)
  const isTomorrow = date.toDateString() === tom.toDateString()
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  const isYesterday = date.toDateString() === yest.toDateString()

  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (isToday) return `Today · ${time}`
  if (isTomorrow) return `Tomorrow · ${time}`
  if (isYesterday) return `Yesterday · ${time}`
  return `${dateStr} · ${time}`
}

function WatchedToggle({ watched, onToggle, toggling }) {
  return (
    <button
      onClick={onToggle}
      disabled={toggling}
      title={watched ? 'Click to unwatch' : 'Mark as watched'}
      className={[
        'w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 border',
        toggling ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        watched
          ? 'bg-green-500 border-green-500 hover:bg-red-500/80 hover:border-red-500/80'
          : 'bg-transparent border-slate-600 hover:border-slate-400',
      ].join(' ')}
    >
      <svg
        className={`w-3.5 h-3.5 transition-colors ${watched ? 'text-white' : 'text-slate-500'}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    </button>
  )
}

function DismissButton({ dismissed, onToggle, dismissing }) {
  return (
    <button
      onClick={onToggle}
      disabled={dismissing}
      title={dismissed ? 'Click to restore to queue' : 'Not interested — skip this game'}
      className={[
        'w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 border',
        dismissing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        dismissed
          ? 'bg-red-500/20 border-red-500/40 hover:bg-slate-700 hover:border-slate-600'
          : 'bg-transparent border-slate-700 hover:border-red-500/60 hover:bg-red-500/10',
      ].join(' ')}
    >
      <svg className={`w-3 h-3 transition-colors ${dismissed ? 'text-red-400' : 'text-slate-600 group-hover:text-red-400'}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}

// resultColor: 'win' | 'loss' | null — used in Watched tab
// showDismissAction: show the dismiss/un-dismiss X button
// trackedTeamId: used by hero card to compute Home/Away badge
// forceWatched: treat the card as watched without an isWatched(game.id, ...)
//   match — needed for Tests in the Results Log, where "watched" is tracked
//   per day-row id, not the whole match's own id.
// readOnly: suppress the watched-toggle/dismiss controls entirely (Results
//   Log is a history view, not a queue you manage from).
export default function GameCard({ game, isUpNext = false, resultColor = null, showDismissAction = false, trackedTeamId = null, className = '', forceWatched = false, readOnly = false }) {
  const { isWatched, toggleWatched, isDismissed, toggleDismissed } = useWatched()
  const watched = forceWatched || isWatched(game.id, game.league)
  const dismissed = isDismissed(game.id, game.league)
  const league = LEAGUE_MAP[game.league]
  const [toggling, setToggling] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const countdown = useCountdown(game.status === 'scheduled' ? game.gameDate : null)

  // Never reveal a score — live or final — until the user has marked the
  // game watched. They watch on delay and don't want anything spoiled.
  const showScore = !dismissed && watched
  const canToggle = !readOnly && isFirebaseConfigured && game.status === 'final' && !dismissed
  const canDismiss = !readOnly && showDismissAction && isFirebaseConfigured && game.status !== 'live' && !watched
  const showHighlight = !dismissed && game.status === 'final' && game.highlightUrl
  const hasPitchers = !dismissed && (game.probablePitchers?.away || game.probablePitchers?.home)

  const homeWon = game.homeWon ?? (showScore && game.status === 'final' && game.homeScore > game.awayScore)
  const awayWon = game.awayWon ?? (showScore && game.status === 'final' && game.awayScore > game.homeScore)

  async function handleToggle() {
    if (!canToggle || toggling) return
    setToggling(true)
    try { await toggleWatched(game) } finally { setToggling(false) }
  }

  async function handleDismiss() {
    if (!canDismiss || dismissing) return
    setDismissing(true)
    try { await toggleDismissed(game) } finally { setDismissing(false) }
  }

  // ── Hero card layout ───────────────────────────────────────────────────────
  if (isUpNext) {
    const isTrackedHome = trackedTeamId && game.homeTeam.id === trackedTeamId
    const isTrackedAway = trackedTeamId && game.awayTeam.id === trackedTeamId
    const locationLabel = isTrackedHome ? 'Home' : isTrackedAway ? 'Away' : null

    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(200,35,35,0.22) 0%, rgba(8,11,32,0.82) 30%, rgba(8,11,32,0.82) 68%, rgba(30,65,210,0.18) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Tags row */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {!dismissed && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800/70 text-slate-300 border border-slate-700/40">
                {game.gameType}
              </span>
            )}
            {!dismissed && game.difficulty && (
              <span className={`text-xs px-2.5 py-1 rounded-full ${game.difficulty.cls}`}>
                {game.difficulty.label}
              </span>
            )}
          </div>
          {locationLabel && !dismissed && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800/70 text-slate-300 border border-slate-700/40 shrink-0">
              {locationLabel}
            </span>
          )}
        </div>

        {!dismissed && game.seriesLabel && (
          <p className="text-center text-xs text-slate-500 truncate px-6">{game.seriesLabel}</p>
        )}

        {/* Date */}
        <p className="text-center text-sm text-slate-400 mt-1 mb-3">
          {formatGameDate(game.gameDate)}
        </p>

        {/* Countdown — scheduled games only */}
        {countdown && (
          <div className="flex items-center justify-center mb-5">
            <span className="text-sm tabular-nums tracking-wide text-slate-100" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{countdown}</span>
          </div>
        )}
        {!countdown && <div className="mb-5" />}

        {/* Teams — horizontal layout */}
        <div className="flex items-center px-4 mb-3">
          {/* Away team */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <p className="text-right font-bold text-base text-slate-100 leading-snug max-w-[110px]">
              {game.awayTeam.name}
            </p>
            <TeamLogo src={game.awayTeam.logo} alt={game.awayTeam.abbreviation} size={54} />
          </div>

          {/* Status center */}
          <div className="w-20 flex flex-col items-center justify-center shrink-0 gap-1">
            {game.status === 'final' && (
              <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">FINAL</span>
            )}
            {game.status === 'live' && (
              <>
                <span className="w-2 h-2 rounded-full bg-red-400 live-pulse" />
                <span className="text-xs font-bold text-red-400">LIVE</span>
              </>
            )}
            {game.status === 'scheduled' && (
              <span className="text-xs text-slate-500 text-center leading-tight">{game.statusDetail}</span>
            )}
            {showScore && game.status !== 'scheduled' && (
              game.homeScoreStr || game.awayScoreStr
                ? <p className="text-center text-xs font-medium text-slate-300 mt-1 px-1">{game.statusDetail}</p>
                : <div className="flex items-center gap-2 mt-1">
                    <span className={`text-lg font-bold tabular-nums ${awayWon ? 'text-slate-100' : 'text-slate-500'}`}>
                      {game.awayScore}
                    </span>
                    <span className="text-slate-700">–</span>
                    <span className={`text-lg font-bold tabular-nums ${homeWon ? 'text-slate-100' : 'text-slate-500'}`}>
                      {game.homeScore}
                    </span>
                  </div>
            )}
          </div>

          {/* Home team */}
          <div className="flex items-center gap-3 flex-1">
            <TeamLogo src={game.homeTeam.logo} alt={game.homeTeam.abbreviation} size={54} />
            <p className="font-bold text-base text-slate-100 leading-snug max-w-[110px]">
              {game.homeTeam.name}
            </p>
          </div>
        </div>

        {/* Starting pitchers */}
        {hasPitchers && (
          <p className="text-center text-xs pb-1 px-6">
            <span className="text-slate-400">{game.probablePitchers.away?.lastName ?? '?'}</span>
            <span className="text-slate-700 mx-1.5">vs</span>
            <span className="text-slate-400">{game.probablePitchers.home?.lastName ?? '?'}</span>
          </p>
        )}

        {/* Venue */}
        {game.venue && !dismissed && (
          <p className="text-center text-xs text-slate-500 pb-4 px-6">{game.venue}</p>
        )}

        {/* Actions */}
        <div className="px-2 pb-2 flex flex-col gap-2">
          {showHighlight && (
            <a
              href={game.highlightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-sm font-medium transition-colors border border-slate-700/40"
            >
              Watch Highlights
            </a>
          )}
          {(canDismiss || canToggle) && (
            <div className="flex justify-center gap-3 pt-1">
              {canDismiss && <DismissButton dismissed={dismissed} onToggle={handleDismiss} dismissing={dismissing} />}
              {canToggle && <WatchedToggle watched={watched} onToggle={handleToggle} toggling={toggling} />}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Standard card layout ───────────────────────────────────────────────────
  const accentBorder = dismissed        ? 'border-l-slate-700'
                      : resultColor === 'win'  ? 'border-l-green-500'
                      : resultColor === 'loss' ? 'border-l-red-500'
                      : league.borderClass

  const glassStyle = dismissed
    ? { background: 'rgba(255,255,255,0.02)', opacity: 0.5, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.05)' }
    : resultColor === 'win'
    ? { background: 'rgba(34,197,94,0.1)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(34,197,94,0.25)', boxShadow: '0 4px 24px rgba(34,197,94,0.08)' }
    : resultColor === 'loss'
    ? { background: 'rgba(239,68,68,0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(239,68,68,0.2)' }
    : watched
    ? undefined // .watched-card handles it
    : { background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }

  return (
    <div
      className={`rounded-xl border-l-4 p-4 transition-all duration-200 hover:scale-[1.01] ${accentBorder} ${watched ? 'watched-card' : ''} ${className}`}
      style={glassStyle}
    >

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {dismissed
          ? <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-slate-700/50 text-slate-600 shrink-0">Not interested</span>
          : <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${league.badgeClass} shrink-0`}>{game.gameType}</span>
        }

        {!dismissed && game.difficulty && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${game.difficulty.cls} shrink-0`}>
            {game.difficulty.label}
          </span>
        )}

        {!dismissed && resultColor === 'win' && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 shrink-0">W</span>
        )}
        {!dismissed && resultColor === 'loss' && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">L</span>
        )}

        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="text-xs text-slate-500 truncate">{formatGameDate(game.gameDate)}</span>
          {!dismissed && <RealLifeStatus status={game.status} detail={showScore ? game.statusDetail : null} />}
        </div>

        {canDismiss && (
          <DismissButton dismissed={dismissed} onToggle={handleDismiss} dismissing={dismissing} />
        )}
        {canToggle && (
          <WatchedToggle watched={watched} onToggle={handleToggle} toggling={toggling} />
        )}
      </div>

      {!dismissed && game.seriesLabel && (
        <p className="text-xs text-slate-500 -mt-2 mb-3 truncate">{game.seriesLabel}</p>
      )}

      {/* Teams + scores */}
      <div className="flex flex-col gap-2 mb-3">
        {[
          { team: game.awayTeam, score: game.awayScoreStr ?? game.awayScore, won: awayWon, label: 'Away' },
          { team: game.homeTeam, score: game.homeScoreStr ?? game.homeScore, won: homeWon, label: 'Home' },
        ].map(({ team, score, won, label }) => (
          <div key={team.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <TeamLogo src={team.logo} alt={team.abbreviation} />
              <div className="min-w-0">
                <p className={`font-semibold text-sm leading-tight truncate ${dismissed ? 'text-slate-600' : won ? 'text-slate-100' : 'text-slate-400'}`}>
                  {team.name}
                </p>
                <p className="text-xs text-slate-600">{team.abbreviation} · {label}</p>
              </div>
            </div>
            {game.status !== 'scheduled' && (
              showScore
                ? <span className={`font-bold tabular-nums ${typeof score === 'string' ? 'text-sm text-right max-w-[90px]' : 'text-2xl'} ${won ? 'text-slate-100' : 'text-slate-500'}`}>{score}</span>
                : <span className="text-slate-700 text-xl font-bold select-none" title={dismissed ? 'Skipped' : 'Watch first'}>—</span>
            )}
          </div>
        ))}
      </div>

      {/* Countdown — scheduled games only */}
      {!dismissed && countdown && (
        <div className="flex items-center justify-center mb-3">
          <span className="text-xs tabular-nums tracking-wide text-slate-400" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{countdown}</span>
        </div>
      )}

      {/* Starting pitchers */}
      {hasPitchers && (
        <div className="flex items-center gap-2 py-2 border-t border-slate-800/60 mb-1">
          <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
            <path strokeLinecap="round" strokeWidth="1.5" d="M12 8c-1.5 2-1.5 6 0 8M12 8c1.5 2 1.5 6 0 8M4 12h16"/>
          </svg>
          <span className="text-xs text-slate-500">
            <span className="text-slate-400">{game.probablePitchers.away?.lastName ?? '?'}</span>
            <span className="text-slate-700 mx-1.5">vs</span>
            <span className="text-slate-400">{game.probablePitchers.home?.lastName ?? '?'}</span>
          </span>
          <span className="text-xs text-slate-700">Starting pitchers</span>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-slate-800 pt-3 flex items-center justify-between gap-2">
        {game.venue && !dismissed
          ? <p className="text-xs text-slate-600 truncate">{game.venue}</p>
          : <span />
        }
        <div className="flex items-center gap-2 shrink-0">
          {showHighlight && (
            <a
              href={game.highlightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 border border-red-600/30 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>
              </svg>
              {watched ? 'Highlights' : 'Watch Highlights'}
            </a>
          )}
          {!dismissed && game.status === 'live' && game.highlightUrl && (
            <a
              href={game.highlightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/50 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 live-pulse" />
              Watch Live
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
