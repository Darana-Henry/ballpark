import { useState, useEffect, useMemo } from 'react'
import { fetchIntlCricketGames, refreshIntlCricketGames } from '../api/intlCricket'
import GameCard from '../components/GameCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useWatched } from '../contexts/WatchedContext'

const LEAGUE = 'cricket'

// ─── Format filter ─────────────────────────────────────────────────────────────

const FORMAT_FILTERS = [
  { id: 'all',   label: 'All' },
  { id: 'test',  label: 'Tests' },
  { id: 'odi',   label: 'ODIs' },
  { id: 't20i',  label: 'T20Is' },
]

function FormatPills({ active, onChange }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {FORMAT_FILTERS.map(f => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={[
            'px-3 py-1 rounded-full text-xs font-semibold transition-colors border',
            active === f.id
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
              : 'bg-transparent text-slate-500 border-slate-700/50 hover:text-slate-300 hover:border-slate-600',
          ].join(' ')}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

function applyFormatFilter(games, format) {
  if (format === 'all') return games
  return games.filter(g => g.matchType === format)
}

// ─── My Queue tab ──────────────────────────────────────────────────────────────

function QueueTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showWatched, setShowWatched] = useState(false)
  const [format, setFormat] = useState('all')

  const filtered = useMemo(() => applyFormatFilter(games, format), [games, format])

  const { upNext, unwatched, watched } = useMemo(() => {
    const live = filtered.filter(g => g.status === 'live' && !isDismissed(g.id, LEAGUE))
    const finalUnwatched = filtered
      .filter(g => g.status === 'final' && !isWatched(g.id, LEAGUE) && !isDismissed(g.id, LEAGUE))
      .sort((a, b) => a.gameDate - b.gameDate)
    const scheduled = filtered
      .filter(g => g.status === 'scheduled' && !isDismissed(g.id, LEAGUE))
      .sort((a, b) => a.gameDate - b.gameDate)
    const watchedList = filtered.filter(g => isWatched(g.id, LEAGUE)).sort((a, b) => b.gameDate - a.gameDate)

    const upNext   = finalUnwatched[0] ?? live[0] ?? scheduled[0]
    const upNextId = upNext?.id
    const remaining = [
      ...finalUnwatched.filter(g => g.id !== upNextId),
      ...live.filter(g => g.id !== upNextId),
      ...scheduled.filter(g => g.id !== upNextId),
    ]
    return { upNext, unwatched: remaining, watched: watchedList }
  }, [filtered, isWatched, isDismissed])

  return (
    <div className="flex flex-col gap-4">
      <FormatPills active={format} onChange={setFormat} />

      {!upNext && unwatched.length === 0 && watched.length === 0 && (
        <EmptyState emoji="✅" title="All caught up" message="No unwatched international matches in your queue." />
      )}

      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameCard game={upNext} isUpNext showDismissAction />
            <div className="rounded-2xl p-5 flex flex-col gap-2"
              style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}>
              <p className="text-cyan-400 font-semibold text-sm">International Cricket 2026</p>
              <p className="text-slate-500 text-xs leading-relaxed">
                All formats — Tests, ODIs, and T20Is — between the 12 Full Member nations.
                Mark matches as watched to build your personal log.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {['ENG','SA','AUS','NZ','IND','PAK','WI','SL','BAN','ZIM','AFG','IRE'].map(a => (
                  <span key={a} className="text-[10px] font-bold px-1.5 py-0.5 rounded text-slate-600 bg-slate-800/60">{a}</span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {unwatched.length > 0 && upNext && (
        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 border-t border-white/[0.07]" />
          <span className="text-xs text-slate-600 shrink-0">{unwatched.length} more</span>
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

// ─── All Matches tab ───────────────────────────────────────────────────────────

function AllMatchesTab({ games }) {
  const [format, setFormat] = useState('all')

  const filtered = useMemo(() => applyFormatFilter(games, format), [games, format])

  const bySeries = useMemo(() => {
    const map = new Map()
    const sorted = [...filtered].sort((a, b) => b.gameDate - a.gameDate)
    for (const g of sorted) {
      const key = g.seriesLabel || 'International Cricket'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    return [...map.entries()]
  }, [filtered])

  const formatLabel = { test: 'test', odi: 'ODI', t20i: 'T20I' }

  return (
    <div className="flex flex-col gap-6">
      <FormatPills active={format} onChange={setFormat} />

      {bySeries.length === 0 && (
        <EmptyState emoji="🏏" title="No matches found" message="Try a different format filter or refresh." />
      )}

      {bySeries.map(([seriesName, seriesGames]) => {
        const formats = [...new Set(seriesGames.map(g => g.matchType))]
        const formatTags = formats.map(f => formatLabel[f] || f).join(' · ')
        return (
          <div key={seriesName}>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest shrink-0">{seriesName}</p>
              <div className="flex-1 border-t border-cyan-900/40" />
              <span className="text-[10px] text-slate-700 shrink-0">{formatTags} · {seriesGames.length} match{seriesGames.length !== 1 ? 'es' : ''}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {seriesGames.map(g => <GameCard key={g.id} game={g} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Watched tab ───────────────────────────────────────────────────────────────

function WatchedTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showSkipped, setShowSkipped] = useState(false)
  const [format, setFormat] = useState('all')

  const watched = useMemo(
    () => applyFormatFilter(games.filter(g => isWatched(g.id, LEAGUE)), format).sort((a, b) => b.gameDate - a.gameDate),
    [games, isWatched, format]
  )
  const skipped = useMemo(
    () => applyFormatFilter(games.filter(g => isDismissed(g.id, LEAGUE)), format).sort((a, b) => b.gameDate - a.gameDate),
    [games, isDismissed, format]
  )

  if (watched.length === 0 && skipped.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <FormatPills active={format} onChange={setFormat} />
        <EmptyState emoji="🏏" title="No watched matches yet" message="Mark matches as watched from My Queue." />
      </div>
    )

  const byFormat = { test: 0, odi: 0, t20i: 0 }
  for (const g of watched) if (byFormat[g.matchType] !== undefined) byFormat[g.matchType]++

  return (
    <div className="flex flex-col gap-4">
      <FormatPills active={format} onChange={setFormat} />

      {watched.length > 0 && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 rounded-xl px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-cyan-400 font-bold text-lg">{watched.length}</span>
              <span className="text-slate-600 text-sm">match{watched.length !== 1 ? 'es' : ''} watched</span>
            </div>
            {format === 'all' && (
              <div className="flex gap-2">
                {byFormat.test > 0  && <span className="text-xs px-2 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">{byFormat.test} Tests</span>}
                {byFormat.odi > 0   && <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{byFormat.odi} ODIs</span>}
                {byFormat.t20i > 0  && <span className="text-xs px-2 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">{byFormat.t20i} T20Is</span>}
              </div>
            )}
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

// ─── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'queue',   label: 'My Queue'     },
  { id: 'all',     label: 'All Matches'  },
  { id: 'watched', label: 'Watched'      },
]

const ENV_KEY = import.meta.env.VITE_CRICAPI_KEY || ''

function timeAgo(date) {
  if (!date) return null
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function IntlCricketView() {
  const [apiKey, setApiKey]         = useState(() => ENV_KEY || localStorage.getItem('cricapi_key') || '')
  const [games, setGames]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [tab, setTab]               = useState('queue')
  const [updatedAt, setUpdatedAt]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshSummary, setRefreshSummary] = useState(null)

  useEffect(() => {
    if (!apiKey) return
    setLoading(true)
    setError(null)
    fetchIntlCricketGames(apiKey)
      .then(({ games, updatedAt }) => { setGames(games); setUpdatedAt(updatedAt) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [apiKey])

  async function handleRefresh() {
    if (!apiKey || refreshing) return
    setRefreshing(true)
    setError(null)
    setRefreshSummary(null)
    try {
      const { games, updatedAt, fetched } = await refreshIntlCricketGames(apiKey)
      setGames(games)
      setUpdatedAt(updatedAt)
      setRefreshSummary(
        fetched > 0
          ? `${games.length} matches loaded · ${fetched} new score${fetched !== 1 ? 's' : ''} fetched from API`
          : `${games.length} matches loaded · all scores already cached`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  if (!apiKey) return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-4 mb-7">
        <div className="w-[72px] h-[72px] rounded-full bg-cyan-950/40 border border-cyan-900/40 flex items-center justify-center text-3xl shrink-0">🏏</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">International Cricket</h2>
          <p className="text-sm text-slate-500 mt-0.5">Tests · ODIs · T20Is · All 12 nations</p>
        </div>
      </div>
      <div className="rounded-2xl p-8 flex flex-col items-center text-center gap-5 max-w-md mx-auto"
        style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-5xl">🏏</span>
        <div>
          <h3 className="text-lg font-semibold text-slate-200 mb-1">CricAPI Key Required</h3>
          <p className="text-sm text-slate-500">
            Cricket data comes from{' '}
            <a href="https://www.cricapi.com" target="_blank" rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline">cricapi.com</a>.
            {' '}Get a free key (100 req/day) — the same key used for WTC.
          </p>
        </div>
        <div className="w-full flex flex-col gap-2">
          <input
            type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="Paste your CricAPI key here"
            className="w-full px-3 py-2.5 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            onKeyDown={e => { if (e.key === 'Enter' && apiKey.trim()) localStorage.setItem('cricapi_key', apiKey.trim()) }}
          />
          <button onClick={() => { const k = apiKey.trim(); if (k) { localStorage.setItem('cricapi_key', k); setApiKey(k) } }}
            disabled={!apiKey.trim()}
            className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
            Save Key & Load Matches
          </button>
        </div>
        <p className="text-xs text-slate-600">Key stored locally in your browser only · First load uses ~8 API calls</p>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-7">
        <div className="w-[72px] h-[72px] rounded-full bg-cyan-950/40 border border-cyan-900/40 flex items-center justify-center text-3xl shrink-0">🏏</div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">International Cricket</h2>
          <p className="text-sm text-slate-500 mt-0.5">Tests · ODIs · T20Is · 12 Full Member nations</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-cyan-800/50 bg-cyan-950/30 text-cyan-400 hover:bg-cyan-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? (
              <>
                <span className="w-3 h-3 border border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Update
              </>
            )}
          </button>
          {updatedAt && (
            <span className="text-[10px] text-slate-600">Updated {timeAgo(updatedAt)}</span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      {games.length > 0 && (
        <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5"
          style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
              style={tab === t.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
              {t.label}
              {tab === t.id && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-cyan-500 rounded-full" />}
            </button>
          ))}
        </div>
      )}

      {/* Refresh summary */}
      {refreshSummary && !error && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl text-sm text-emerald-400"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {refreshSummary}
        </div>
      )}

      {loading && <LoadingSpinner message="Loading international cricket matches…" />}

      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm flex items-start gap-3">
          <span className="shrink-0">⚠</span>
          <div>
            <p className="font-medium mb-1">Failed to load cricket data</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && games.length === 0 && (
        <div className="flex flex-col items-center text-center gap-3 py-16">
          <span className="text-4xl">🏏</span>
          <p className="text-slate-300 font-medium">No cricket data loaded yet</p>
          <p className="text-sm text-slate-500 max-w-xs">
            Click <span className="text-cyan-400 font-medium">Update</span> above to fetch matches from CricAPI.
            Uses up to 8 API calls from your 100/day free quota.
          </p>
        </div>
      )}

      {!loading && !error && games.length > 0 && tab === 'queue'   && <QueueTab games={games} />}
      {!loading && !error && games.length > 0 && tab === 'all'     && <AllMatchesTab games={games} />}
      {!loading && !error && games.length > 0 && tab === 'watched' && <WatchedTab games={games} />}
    </div>
  )
}
