import { useState } from 'react'
import { WatchedProvider } from './contexts/WatchedContext'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import AuthGate from './components/AuthGate'
import HomeView from './views/HomeView'
import MLBView from './views/MLBView'
import NBAView from './views/NBAView'
import NFLView from './views/NFLView'
import BBLView from './views/BBLView'
import MLSView from './views/MLSView'
import EPLView from './views/EPLView'
import StatsView from './views/StatsView'
import { isFirebaseConfigured } from './firebase'

function FirebaseBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (isFirebaseConfigured || dismissed) return null
  return (
    <div className="bg-amber-950/60 border-b border-amber-900/50 px-4 py-2.5 flex items-center justify-between gap-3">
      <p className="text-xs text-amber-300">
        <span className="font-semibold">Firebase not connected.</span>{' '}
        Edit <code className="bg-amber-900/50 px-1 rounded">src/firebase.js</code> with your credentials to enable watched game tracking.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-500 hover:text-amber-300 shrink-0 text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

const VIEWS = {
  home: HomeView,
  mlb: MLBView,
  nba: NBAView,
  nfl: NFLView,
  bbl: BBLView,
  mls: MLSView,
  epl: EPLView,
  stats: StatsView,
}

export default function App() {
  const [activeLeague, setActiveLeague] = useState('home')
  const ActiveView = VIEWS[activeLeague] || MLBView

  return (
    <AuthGate>
      <WatchedProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar activeLeague={activeLeague} onLeagueChange={setActiveLeague} />

          <div className="flex-1 flex flex-col overflow-hidden">
            <FirebaseBanner />
            <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
              <ActiveView />
            </main>
          </div>

          <MobileNav activeLeague={activeLeague} onLeagueChange={setActiveLeague} />
        </div>
      </WatchedProvider>
    </AuthGate>
  )
}
