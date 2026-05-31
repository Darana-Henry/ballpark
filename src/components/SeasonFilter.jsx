import { getSeasonLabel } from '../utils/season'

export default function SeasonFilter({ league, seasons, selected, onChange }) {
  if (!seasons || seasons.length <= 1) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-600 shrink-0">Season</span>
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => onChange('all')}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            selected === 'all' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          All
        </button>
        {seasons.map(yr => (
          <button
            key={yr}
            onClick={() => onChange(yr)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              selected === yr ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {getSeasonLabel(league, yr)}
          </button>
        ))}
      </div>
    </div>
  )
}
