import { useState } from 'react'
import { LEAGUES } from '../constants/leagues'
import { useWatched } from '../contexts/WatchedContext'

function LeagueIcon({ league }) {
  const [err, setErr] = useState(false)
  if (!league.logoUrl || err) {
    return (
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${league.iconBg}`}>
        {league.emoji}
      </div>
    )
  }
  return (
    <img
      src={league.logoUrl}
      alt={league.name}
      width={32}
      height={32}
      className={`w-8 h-8 rounded-full object-contain p-1 shrink-0 ${league.iconBg}`}
      onError={() => setErr(true)}
    />
  )
}

function NavItem({ league, active, onClick }) {
  const { watchedForLeague } = useWatched()
  const watchedCount = watchedForLeague(league.id).length

  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-150',
        active
          ? 'bg-slate-800/80 text-slate-100'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40',
      ].join(' ')}
    >
      <LeagueIcon league={league} />
      <span className={`flex-1 text-sm font-semibold leading-tight ${active ? 'text-slate-100' : 'text-slate-300'}`}>
        {league.name}
      </span>
      {watchedCount > 0 && (
        <span className="shrink-0 text-xs font-bold text-blue-300 bg-blue-900/60 border border-blue-800/50 px-2 py-0.5 rounded-full">
          {watchedCount}
        </span>
      )}
    </button>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function BarChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function AlarmClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M5 3 2 6" />
      <path d="M22 6 19 3" />
    </svg>
  )
}

export default function Sidebar({ activeLeague, onLeagueChange }) {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0" style={{ background: 'rgba(6,8,22,0.75)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Logo */}
      <div className="px-4 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center shrink-0">
            <span className="text-lg leading-none">⚾</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 leading-tight tracking-tight">Ballpark</h1>
            <p className="text-[11px] text-slate-500">Sports tracker</p>
          </div>
        </div>
      </div>

      {/* Home */}
      <div className="px-3 mb-4">
        <button
          onClick={() => onLeagueChange('home')}
          className={[
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-150',
            activeLeague === 'home'
              ? 'bg-slate-800/80 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40',
          ].join(' ')}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activeLeague === 'home' ? 'bg-slate-700' : 'bg-slate-800/60'}`}>
            <HomeIcon />
          </div>
          <span className={`text-sm font-semibold ${activeLeague === 'home' ? 'text-slate-100' : 'text-slate-300'}`}>
            Home
          </span>
        </button>
      </div>

      {/* Leagues section */}
      <div className="px-4 mb-1">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Leagues</p>
      </div>
      <nav className="px-3 flex flex-col gap-0.5">
        {LEAGUES.map(league => (
          <NavItem
            key={league.id}
            league={league}
            active={activeLeague === league.id}
            onClick={() => onLeagueChange(league.id)}
          />
        ))}
      </nav>

      {/* Fantasy section */}
      <div className="px-4 mt-5 mb-1">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Fantasy</p>
      </div>
      <div className="px-3">
        <button
          onClick={() => onLeagueChange('deadlines')}
          className={[
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-150',
            activeLeague === 'deadlines'
              ? 'bg-slate-800/80 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40',
          ].join(' ')}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activeLeague === 'deadlines' ? 'bg-slate-700' : 'bg-slate-800/60'}`}>
            <AlarmClockIcon />
          </div>
          <span className={`text-sm font-semibold ${activeLeague === 'deadlines' ? 'text-slate-100' : 'text-slate-300'}`}>
            Deadlines
          </span>
        </button>
      </div>

      {/* Analytics section */}
      <div className="px-4 mt-5 mb-1">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Analytics</p>
      </div>
      <div className="px-3">
        <button
          onClick={() => onLeagueChange('stats')}
          className={[
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-150',
            activeLeague === 'stats'
              ? 'bg-slate-800/80 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40',
          ].join(' ')}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activeLeague === 'stats' ? 'bg-slate-700' : 'bg-slate-800/60'}`}>
            <BarChartIcon />
          </div>
          <span className={`text-sm font-semibold ${activeLeague === 'stats' ? 'text-slate-100' : 'text-slate-300'}`}>
            Stats
          </span>
        </button>
      </div>

      <div className="flex-1" />

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[11px] text-slate-700">Ballpark © {new Date().getFullYear()}</p>
      </div>
    </aside>
  )
}
