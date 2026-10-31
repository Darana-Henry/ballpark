import { competitionsIn } from '../utils/competitions'

// Segmented row of competitions for the All games, Watched and Standings tabs.
// Hidden when the games only span one competition, since "All" would be the
// only meaningful choice.
export default function CompetitionFilter({ games, league, value, onChange, className = 'mb-4' }) {
  const competitions = competitionsIn(games, league)
  if (competitions.length <= 1) return null
  const options = ['all', ...competitions]

  return (
    <div
      className={`flex gap-1 rounded-xl p-1 flex-wrap w-fit max-w-full ${className}`}
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {options.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${value === c ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          style={value === c ? { background: 'rgba(255,255,255,0.1)' } : {}}
        >
          {c === 'all' ? 'All' : c}
        </button>
      ))}
    </div>
  )
}
