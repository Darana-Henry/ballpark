import { LEAGUES } from '../constants/leagues'

const ALL_TABS = [
  { id: 'home', name: 'Home', emoji: '🏠' },
  ...LEAGUES,
  { id: 'europe', name: 'Europe', emoji: '🏆' },
  { id: 'deadlines', name: 'Deadlines', emoji: '⏰' },
  { id: 'fpl', name: 'FPL', emoji: '👑' },
  { id: 'eliteserien', name: 'Elite', emoji: '🇳🇴' },
  { id: 'allsvenskan', name: 'Allsv', emoji: '🇸🇪' },
  { id: 'stats', name: 'Stats', emoji: '📊' },
]

export default function MobileNav({ activeLeague, onLeagueChange }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#111118] border-t border-slate-800 z-50">
      {/* Swipes sideways once the tabs outgrow the screen; each keeps room for its label */}
      <div className="flex items-stretch overflow-x-auto scrollbar-hide">
        {ALL_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onLeagueChange(tab.id)}
            className={[
              'flex-1 min-w-14 shrink-0 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors',
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
