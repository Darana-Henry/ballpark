import { LEAGUES } from '../constants/leagues'

const ALL_TABS = [
  { id: 'home', name: 'Home', emoji: '🏠' },
  ...LEAGUES,
  { id: 'stats', name: 'Stats', emoji: '📊' },
]

export default function MobileNav({ activeLeague, onLeagueChange }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#111118] border-t border-slate-800 z-50">
      <div className="flex items-stretch">
        {ALL_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onLeagueChange(tab.id)}
            className={[
              'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors',
              activeLeague === tab.id ? 'text-slate-100' : 'text-slate-600 hover:text-slate-400',
            ].join(' ')}
          >
            <span className="text-lg leading-none">{tab.emoji}</span>
            <span className="text-[10px] font-medium">{tab.name}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
