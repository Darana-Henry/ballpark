import { LEAGUE_MAP } from '../constants/leagues'
import { useCountdown } from '../hooks/useCountdown'
import { useNextSeason } from '../hooks/useNextSeason'

function formatOpener(date, dateOnly) {
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (dateOnly) return day
  return `${day} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

// A date-only opener counts down to the start of that day: "how many more
// days" is what matters, and the time isn't known.
function countdownTarget(opener) {
  if (!opener) return null
  if (!opener.dateOnly) return opener.date
  const d = new Date(opener.date)
  d.setHours(0, 0, 0, 0)
  return d
}

function daysUntil(date) {
  return Math.max(0, Math.ceil((date - Date.now()) / 86400000))
}

/**
 * Banner at the top of a league's tab while it's between seasons: how long
 * until the next season's first game. Renders nothing during a season.
 */
export default function SeasonCountdown({ league, games, loading = false }) {
  const opener = useNextSeason(league, games, loading)
  const target = countdownTarget(opener)
  const countdown = useCountdown(target)
  if (!opener || !countdown) return null
  const info = LEAGUE_MAP[league]
  const days = daysUntil(target)

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 mb-5"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${info?.textClass ?? 'text-slate-100'}`}>{days}</span>
        <span className="text-sm text-slate-400">day{days === 1 ? '' : 's'} to go</span>
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-slate-200 font-medium">
          {opener.label}{opener.estimated ? ' (estimated)' : ''}
        </span>
        <span className="text-xs text-slate-500">
          {formatOpener(opener.date, opener.dateOnly)} · {countdown}
          {opener.estimated ? ' · schedule not out yet' : ''}
        </span>
        {opener.teamFirst && (
          <span className="text-xs text-slate-500">
            {opener.teamFirst.label} · {formatOpener(opener.teamFirst.date, opener.teamFirst.dateOnly)}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Home-page chip for one league: emoji + days until its next season. Nothing
 * while the league is in season.
 */
export function SeasonCountdownChip({ league, games, loading }) {
  const opener = useNextSeason(league, games, loading)
  const target = countdownTarget(opener)
  const countdown = useCountdown(target)
  if (!opener || !countdown) return null
  const info = LEAGUE_MAP[league]
  const days = daysUntil(target)
  return (
    <div
      className="flex items-center h-8 gap-1.5 px-2.5 rounded-full shrink-0"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      title={`${info?.name ?? league} · ${opener.label}${opener.estimated ? ' (estimated)' : ''} · ${formatOpener(opener.date, opener.dateOnly)}`}
    >
      <span className="text-sm">{info?.emoji}</span>
      <span className="text-xs text-slate-400">{info?.name}</span>
      <span className={`text-xs font-bold tabular-nums ${info?.textClass ?? 'text-slate-200'}`}>
        {opener.estimated ? '~' : ''}{days}d
      </span>
    </div>
  )
}
