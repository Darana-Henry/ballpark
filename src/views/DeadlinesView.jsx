import { useState } from 'react'
import { useFantasyDeadlines, DEADLINES_UPDATED_AT } from '../hooks/useFantasyDeadlines'
import { useCountdown } from '../hooks/useCountdown'
import FantasyLeagueIcon from '../components/FantasyLeagueIcon'

// A provisional round's kickoff times are placeholders until TV picks are
// announced, so only its date means anything.
function formatDeadline(round) {
  const dateStr = round.deadline.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (round.provisional) return `${dateStr} · time TBC`
  const timeStr = round.deadline.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${dateStr} · ${timeStr}`
}

function formatUpdated(date) {
  const hours = Math.round((Date.now() - date) / 3_600_000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.round(hours / 24)} days ago`
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
            <p className="text-xs text-slate-600 truncate">{nextRound.label} · {formatDeadline(nextRound)}</p>
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
              {nextRound.provisional ? 'TBC' : (countdown ?? 'Locked')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Subscribe-by-URL card for the calendar the deploy job builds alongside the
// deadlines. Google ignores reminders inside subscribed calendars, so each
// event starts an hour before its deadline and the one-time setup is a
// notification "at start of event".
function CalendarCard() {
  const [copied, setCopied] = useState(false)
  const url = new URL(`${import.meta.env.BASE_URL}fantasy-deadlines.ics`, window.location.origin).href
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, 'webcal:'))}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked; the link is selectable */ }
  }

  return (
    <div className="rounded-xl p-4 mt-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-sm font-semibold text-slate-200">📅 Deadline reminders in your calendar</p>
      <p className="text-xs text-slate-500 mt-1">
        One event per round, starting an hour before the deadline. Deadlines refresh every 6 hours.
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <a
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          Add to Google Calendar
        </a>
        <button onClick={copy} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200">
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        <code className="text-[11px] text-slate-600 break-all select-all">{url}</code>
      </div>
      <p className="text-[11px] text-slate-600 mt-3">
        Then in Google Calendar: <span className="text-slate-400">Settings → Fantasy deadlines → Event notifications → "At start of event"</span>.
        That's your one-hour warning; Google ignores reminders set inside subscribed calendars.
      </p>
    </div>
  )
}

export default function DeadlinesView() {
  const cards = useFantasyDeadlines()

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-100 leading-tight">Deadlines</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Next fantasy lineup lock, per league · updated {formatUpdated(DEADLINES_UPDATED_AT)}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map(({ league, nextRound, loading, failed }) => (
          <DeadlineCard key={league.id} league={league} nextRound={nextRound} loading={loading} failed={failed} />
        ))}
      </div>

      <CalendarCard />
    </div>
  )
}
