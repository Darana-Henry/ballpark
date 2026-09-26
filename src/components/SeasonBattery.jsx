// Season coverage as a battery: how much of the whole season has been watched.
//
// Deliberately a different measure from the queue panel's "Completion" line.
// That one is watched ÷ games *played*, which sits near 100% if you keep up.
// This is watched ÷ every game the season holds, so it fills slowly across the
// year and answers "how much of the season have I seen".
export default function SeasonBattery({ watched = 0, total = 0, accentColor = '#64748b', title }) {
  const known = total > 0
  const pct = known ? Math.min(100, Math.round((watched / total) * 100)) : 0

  return (
    <span
      className="shrink-0 inline-flex items-center gap-[2px]"
      title={title ?? (known ? `${watched} of ${total} games this season watched (${pct}%)` : 'Season length unknown')}
    >
      <span
        className="relative inline-flex items-center justify-center rounded-[3px] overflow-hidden"
        style={{
          width: 34,
          height: 15,
          border: `1px solid ${known ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)'}`,
          background: 'rgba(255,255,255,0.05)',
        }}
      >
        <span
          className="absolute left-0 top-0 bottom-0 transition-all duration-500"
          style={{ width: `${pct}%`, background: accentColor, opacity: 0.55 }}
        />
        <span className="relative text-[8px] font-bold tabular-nums leading-none text-slate-100">
          {known ? `${pct}%` : '–'}
        </span>
      </span>
      {/* Battery terminal */}
      <span
        className="rounded-[1px]"
        style={{ width: 2, height: 6, background: known ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)' }}
      />
    </span>
  )
}
