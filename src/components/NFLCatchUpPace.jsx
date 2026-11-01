const fmtDate = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const one = n => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toString()

/**
 * The NFL catch-up target inside the Season Record card: games a day to be
 * up to date when the playoffs start, and whether the last two weeks' pace
 * gets there. `plan` is from useCatchUpPlan.
 */
export default function NFLCatchUpPace({ plan }) {
  if (!plan.total) {
    return (
      <p className="text-sm text-emerald-300 text-center leading-relaxed">
        All caught up: nothing left to watch before the playoffs start {fmtDate(plan.start)}.
      </p>
    )
  }
  const onTrack = plan.projectedLeft === 0
  return (
    <div className="flex flex-col items-center text-center gap-1">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">To catch up by the playoffs</p>
      <p className="text-6xl font-bold text-slate-200 leading-none tabular-nums mt-1">{one(plan.perDay)}</p>
      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">games a day · about {Math.ceil(plan.perWeek)} a week</p>
      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
        <span className="font-semibold text-slate-200 tabular-nums">{plan.total}</span> to watch ({plan.behind} played, {plan.toCome} to come)
        {' '}· <span className="font-semibold text-slate-200 tabular-nums">{plan.days}</span> day{plan.days === 1 ? '' : 's'} left
        <br />Wild Card starts {fmtDate(plan.start)}{plan.estimated ? ' (estimated)' : ''}
      </p>
      <p className={`text-xs leading-relaxed ${plan.recent ? (onTrack ? 'text-emerald-400' : 'text-amber-300') : 'text-slate-600'}`}>
        {plan.recent
          ? onTrack
            ? `On track: ${plan.recent} watched in the last 2 weeks (${one(plan.pace)} a day) clears it by ${fmtDate(plan.finishBy)}.`
            : `Behind: ${plan.recent} watched in the last 2 weeks (${one(plan.pace)} a day) leaves about ${plan.projectedLeft} at the playoffs.`
          : 'Nothing marked watched in the last 2 weeks, so no pace yet.'}
      </p>
    </div>
  )
}
