import { useState, useEffect, useMemo } from 'react'
import { fetchBBLGames } from '../api/bbl'
import GameCard from '../components/GameCard'
import SeasonStatsPanel from '../components/SeasonStatsPanel'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useWatched } from '../contexts/WatchedContext'

// ─── API Key Gate ─────────────────────────────────────────────────────────────

function ApiKeyGate({ onKeyReady }) {
  const [input, setInput] = useState('')

  function save() {
    const key = input.trim()
    if (!key) return
    localStorage.setItem('cricapi_key', key)
    onKeyReady(key)
  }

  return (
    <div className="rounded-2xl p-8 flex flex-col items-center text-center gap-5 max-w-md mx-auto"
      style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className="text-5xl">🏏</span>
      <div>
        <h3 className="text-lg font-semibold text-slate-200 mb-1">CricAPI Key Required</h3>
        <p className="text-sm text-slate-500">
          BBL data comes from{' '}
          <a href="https://www.cricapi.com" target="_blank" rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 underline">cricapi.com</a>.
          {' '}Get a free key (100 req/day) — no credit card needed.
        </p>
      </div>
      <div className="w-full flex flex-col gap-2">
        <input
          type="text" value={input} onChange={e => setInput(e.target.value)}
          placeholder="Paste your CricAPI key here"
          className="w-full px-3 py-2.5 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          onKeyDown={e => e.key === 'Enter' && save()}
        />
        <button onClick={save} disabled={!input.trim()}
          className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
          Save Key & Load Games
        </button>
      </div>
      <p className="text-xs text-slate-600">Key stored locally in your browser only · BBL season runs Dec–Feb</p>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function QueueTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showWatched, setShowWatched] = useState(false)

  const { upNext, unwatched, watched } = useMemo(() => {
    const live = games.filter(g => g.status === 'live' && !isDismissed(g.id, 'bbl'))
    const finalUnwatched = games
      .filter(g => g.status === 'final' && !isWatched(g.id, 'bbl') && !isDismissed(g.id, 'bbl'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const scheduled = games
      .filter(g => g.status === 'scheduled' && !isDismissed(g.id, 'bbl'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const watchedList = games.filter(g => isWatched(g.id, 'bbl')).sort((a, b) => b.gameDate - a.gameDate)

    const upNext = finalUnwatched[0] ?? live[0] ?? scheduled[0]
    const upNextId = upNext?.id
    const remaining = [
      ...finalUnwatched.filter(g => g.id !== upNextId),
      ...live.filter(g => g.id !== upNextId),
      ...scheduled.filter(g => g.id !== upNextId),
    ]
    return { upNext, unwatched: remaining, watched: watchedList }
  }, [games, isWatched, isDismissed])

  return (
    <div className="flex flex-col gap-3">
      {!upNext && unwatched.length === 0 && watched.length === 0 && (
        <EmptyState emoji="🏏" title="No BBL matches found"
          message="The Big Bash League runs Dec–Feb. Check back during the Australian summer, or the current season may not be in CricAPI yet." />
      )}
      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameCard game={upNext} isUpNext showDismissAction />
            <SeasonStatsPanel league="bbl" trackedTeamId={null} />
          </div>
        </>
      )}
      {unwatched.length > 0 && upNext && (
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 border-t border-white/[0.07]" />
          <span className="text-xs text-slate-600 shrink-0">{unwatched.length} more upcoming</span>
          <div className="flex-1 border-t border-white/[0.07]" />
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {unwatched.map(g => <GameCard key={g.id} game={g} showDismissAction />)}
      </div>
      {watched.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowWatched(v => !v)}
            className="w-full flex items-center gap-3 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors">
            <div className="flex-1 border-t border-white/[0.07]" />
            <span className="shrink-0 flex items-center gap-1.5">{showWatched ? '▾' : '▸'} {watched.length} watched</span>
            <div className="flex-1 border-t border-white/[0.07]" />
          </button>
          {showWatched && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {watched.map(g => <GameCard key={g.id} game={g} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AllGamesTab({ games }) {
  const sorted = useMemo(() => [...games].sort((a, b) => b.gameDate - a.gameDate), [games])
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {sorted.map(g => <GameCard key={g.id} game={g} />)}
    </div>
  )
}

function WatchedTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showSkipped, setShowSkipped] = useState(false)

  const watched = games.filter(g => isWatched(g.id, 'bbl')).sort((a, b) => b.gameDate - a.gameDate)
  const skipped = games.filter(g => isDismissed(g.id, 'bbl')).sort((a, b) => b.gameDate - a.gameDate)

  if (watched.length === 0 && skipped.length === 0)
    return <EmptyState emoji="🏏" title="No watched matches yet" message="Mark matches as watched from My Queue." />

  return (
    <div className="flex flex-col gap-3">
      {watched.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-2 rounded-xl px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-amber-400 font-bold text-lg">{watched.length}</span>
              <span className="text-slate-600 text-sm">match{watched.length !== 1 ? 'es' : ''} watched</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {watched.map(g => <GameCard key={g.id} game={g} />)}
          </div>
        </>
      )}
      {skipped.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowSkipped(v => !v)}
            className="w-full flex items-center gap-3 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors">
            <div className="flex-1 border-t border-white/[0.07]" />
            <span className="shrink-0 flex items-center gap-1.5">{showSkipped ? '▾' : '▸'} {skipped.length} skipped</span>
            <div className="flex-1 border-t border-white/[0.07]" />
          </button>
          {showSkipped && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {skipped.map(g => <GameCard key={g.id} game={g} showDismissAction />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'queue',   label: 'My Queue'  },
  { id: 'all',     label: 'All Games' },
  { id: 'watched', label: 'Watched'   },
]

export default function BBLView() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('cricapi_key') || '')
  const [games, setGames]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [tab, setTab]       = useState('queue')

  useEffect(() => {
    if (!apiKey) return
    setLoading(true)
    setError(null)
    fetchBBLGames(apiKey)
      .then(setGames)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [apiKey])

  if (!apiKey) return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-4 mb-7">
        <div className="w-[72px] h-[72px] rounded-full bg-amber-950/40 border border-amber-900/40 flex items-center justify-center text-3xl shrink-0">🏏</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">BBL</h2>
          <p className="text-sm text-slate-500 mt-0.5">Big Bash League · All teams</p>
        </div>
      </div>
      <ApiKeyGate onKeyReady={setApiKey} />
    </div>
  )

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-4 mb-7">
        <div className="w-[72px] h-[72px] rounded-full bg-amber-950/40 border border-amber-900/40 flex items-center justify-center text-3xl shrink-0">🏏</div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">BBL</h2>
          <p className="text-sm text-slate-500 mt-0.5">Big Bash League · All teams · powered by CricAPI</p>
        </div>
        <button onClick={() => { localStorage.removeItem('cricapi_key'); setApiKey(''); setGames([]) }}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
          Change key
        </button>
      </div>

      <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5"
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            style={tab === t.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
            {t.label}
            {tab === t.id && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-amber-500 rounded-full" />}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner message="Loading BBL matches from CricAPI..." />}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm flex items-start gap-3">
          <span className="shrink-0">⚠</span>
          <div>
            <p className="font-medium mb-1">Failed to load BBL</p>
            <p>{error}</p>
            <button onClick={() => { localStorage.removeItem('cricapi_key'); setApiKey('') }}
              className="mt-2 text-xs text-red-400/70 hover:text-red-300 underline">
              Clear key and try again
            </button>
          </div>
        </div>
      )}

      {!loading && !error && tab === 'queue'   && <QueueTab games={games} />}
      {!loading && !error && tab === 'all'     && <AllGamesTab games={games} />}
      {!loading && !error && tab === 'watched' && <WatchedTab games={games} />}
    </div>
  )
}
