import { useFantasyDeadlines } from '../hooks/useFantasyDeadlines'
import { useCountdown } from '../hooks/useCountdown'
import FantasyLeagueIcon from '../components/FantasyLeagueIcon'

function formatDeadline(date) {
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${dateStr} · ${timeStr}`
}

function DeadlineCard({ league, nextRound, loading, failed }) {
  const countdown = useCountdown(nextRound ? nextRound.deadline : null)

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
      <div className="flex items-center gap-3 px-4 py-3">
        <FantasyLeagueIcon league={league} size={36} />
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${league.textClass}`}>{league.name}</p>
          {nextRound && (
            <p className="text-xs text-slate-600 truncate">{nextRound.label} · {formatDeadline(nextRound.deadline)}</p>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        {loading ? (
          <p className="text-sm text-slate-600 text-center py-2">Loading fixtures…</p>
        ) : failed ? (
          <p className="text-sm text-slate-600 text-center py-2">Unable to load fixtures</p>
        ) : !nextRound ? (
          <p className="text-sm text-slate-600 text-center py-2">Season complete</p>
        ) : (
          <div className="flex items-center justify-center py-1">
            <span
              className="text-2xl tabular-nums tracking-wide text-slate-100"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {countdown ?? 'Locked'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DeadlinesView() {
  const cards = useFantasyDeadlines()

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-100 leading-tight">Deadlines</h2>
        <p className="text-sm text-slate-500 mt-0.5">Next fantasy lineup lock, per league</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map(({ league, nextRound, loading, failed }) => (
          <DeadlineCard key={league.id} league={league} nextRound={nextRound} loading={loading} failed={failed} />
        ))}
      </div>
    </div>
  )
}
