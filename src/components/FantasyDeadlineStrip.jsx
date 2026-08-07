import { useFantasyDeadlines } from '../hooks/useFantasyDeadlines'
import { useCountdown } from '../hooks/useCountdown'
import FantasyLeagueIcon from './FantasyLeagueIcon'

function DeadlineChip({ league, nextRound, loading, failed }) {
  const countdown = useCountdown(nextRound ? nextRound.deadline : null)
  const display = loading ? '…' : failed ? '—' : !nextRound ? 'Done' : (countdown ?? 'Locked')

  return (
    <div
      className="flex items-center h-8 gap-1.5 pl-1 pr-2.5 rounded-full shrink-0"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      title={nextRound ? `${league.name} · ${nextRound.label}` : league.name}
    >
      <FantasyLeagueIcon league={league} size={22} />
      <span className={`text-xs font-bold tabular-nums ${league.textClass}`}>{display}</span>
    </div>
  )
}

export default function FantasyDeadlineStrip() {
  const cards = useFantasyDeadlines()

  return (
    <div className="flex items-center gap-2 overflow-x-auto mb-6">
      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest shrink-0">Deadlines</span>
      {cards.map(({ league, nextRound, loading, failed }) => (
        <DeadlineChip key={league.id} league={league} nextRound={nextRound} loading={loading} failed={failed} />
      ))}
    </div>
  )
}
