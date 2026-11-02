const fmtDate = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const one = n => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toString()

/**
 * The NFL catch-up target inside the Season Record card: games a day to be
 * up to date when the playoffs start, and whether the last two weeks' pace
 * gets there. `plan` is from useCatchUpPlan.
 */
// The NFL's wording by default; another deadline passes its own `labels`
// on the plan (see useCricketCatchUp).
const NFL_LABELS = {
  title: 'To catch up by the playoffs',
  unit: 'games',
  deadline: 'Wild Card starts',
  atDeadline: 'at the playoffs',
  doneText: start => `All caught up: nothing left to watch before the playoffs start ${fmtDate(start)}.`,
}

export default function NFLCatchUpPace({ plan }) {
  const labels = { ...NFL_LABELS, ...plan.labels }
  if (!plan.total) {
    return (
      <p className="text-sm text-emerald-300 text-center leading-relaxed">
        {labels.doneText(plan.start)}
      </p>
    )
  }
  const onTrack = plan.projectedLeft === 0
  return (
    <div className="flex flex-col items-center text-center gap-1">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{labels.title}</p>
      <p className="text-6xl font-bold text-slate-200 leading-none tabular-nums mt-1">{one(plan.perDay)}</p>
      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{labels.unit} a day · about {Math.ceil(plan.perWeek)} a week</p>
      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
        <span className="font-semibold text-slate-200 tabular-nums">{plan.total}</span> to watch ({plan.behind} played, {plan.toCome} to come)
        {' '}· <span className="font-semibold text-slate-200 tabular-nums">{plan.days}</span> day{plan.days === 1 ? '' : 's'} left
        <br />{labels.deadline} {fmtDate(plan.start)}{plan.estimated ? ' (estimated)' : ''}
      </p>
      <p className={`text-xs leading-relaxed ${plan.recent ? (onTrack ? 'text-emerald-400' : 'text-amber-300') : 'text-slate-600'}`}>
        {plan.recent
          ? onTrack
            ? `On track: ${plan.recent} watched in the last 2 weeks (${one(plan.pace)} a day) clears it by ${fmtDate(plan.finishBy)}.`
            : `Behind: ${plan.recent} watched in the last 2 weeks (${one(plan.pace)} a day) leaves about ${plan.projectedLeft} ${labels.atDeadline}.`
          : 'Nothing marked watched in the last 2 weeks, so no pace yet.'}
      </p>
    </div>
  )
}
