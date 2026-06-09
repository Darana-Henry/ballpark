import { useState, useEffect, useMemo } from 'react'
import { fetchWTCGames, refreshWTCGames } from '../api/wtc'
import GameCard from '../components/GameCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useWatched } from '../contexts/WatchedContext'

// ─── Tabs ──────────────────────────────────────────────────────────────────────

function QueueTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showWatched, setShowWatched] = useState(false)

  const { upNext, unwatched, watched } = useMemo(() => {
    const live = games.filter(g => g.status === 'live' && !isDismissed(g.id, 'wtc'))
    const finalUnwatched = games
      .filter(g => g.status === 'final' && !isWatched(g.id, 'wtc') && !isDismissed(g.id, 'wtc'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const scheduled = games
      .filter(g => g.status === 'scheduled' && !isDismissed(g.id, 'wtc'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const watchedList = games.filter(g => isWatched(g.id, 'wtc')).sort((a, b) => b.gameDate - a.gameDate)

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
        <EmptyState emoji="✅" title="All caught up" message="No unwatched WTC matches in your queue." />
      )}
      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameCard game={upNext} isUpNext showDismissAction />
            <div className="rounded-2xl p-5 flex flex-col gap-2"
              style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)' }}>
              <p className="text-sky-400 font-semibold text-sm">WTC 2025-27</p>
              <p className="text-slate-500 text-xs leading-relaxed">
                The ICC World Test Championship 2025–27 cycle runs across all nine Full Member nations.
                Mark matches as watched to build your personal log.
              </p>
              <a
                href="https://www.icc-cricket.com/world-test-championship"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 text-xs text-sky-400 hover:text-sky-300 underline"
              >
                Official standings at icc-cricket.com →
              </a>
            </div>
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

  const bySeries = useMemo(() => {
    const map = new Map()
    for (const g of sorted) {
      const key = g.seriesName || 'WTC 2025-27'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    return [...map.entries()]
  }, [sorted])

  return (
    <div className="flex flex-col gap-8">
      {bySeries.map(([seriesName, seriesGames]) => (
        <div key={seriesName}>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[10px] font-bold text-sky-500 uppercase tracking-widest shrink-0">{seriesName}</p>
            <div className="flex-1 border-t border-sky-900/40" />
            <span className="text-[10px] text-slate-700 shrink-0">{seriesGames.length} test{seriesGames.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {seriesGames.map(g => <GameCard key={g.id} game={g} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function WatchedTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showSkipped, setShowSkipped] = useState(false)

  const watched = games.filter(g => isWatched(g.id, 'wtc')).sort((a, b) => b.gameDate - a.gameDate)
  const skipped = games.filter(g => isDismissed(g.id, 'wtc')).sort((a, b) => b.gameDate - a.gameDate)

  if (watched.length === 0 && skipped.length === 0)
    return <EmptyState emoji="🏆" title="No watched matches yet" message="Mark matches as watched from My Queue." />

  return (
    <div className="flex flex-col gap-3">
      {watched.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-2 rounded-xl px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-sky-400 font-bold text-lg">{watched.length}</span>
              <span className="text-slate-600 text-sm">test{watched.length !== 1 ? 's' : ''} watched</span>
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

// ─── Standings ────────────────────────────────────────────────────────────────

function buildStandings(watchedGames) {
  const t = {}
  const ensure = (name, logo) => {
    if (!t[name]) t[name] = { name, logo, M: 0, W: 0, L: 0, D: 0, NR: 0, Pts: 0 }
  }
  for (const g of watchedGames) {
    if (g.status !== 'final') continue
    const h = g.homeTeam.name, a = g.awayTeam.name
    ensure(h, g.homeTeam.logo)
    ensure(a, g.awayTeam.logo)
    t[h].M++; t[a].M++

    if (g.homeWon) {
      t[h].W++; t[h].Pts += 12; t[a].L++
    } else if (g.awayWon) {
      t[a].W++; t[a].Pts += 12; t[h].L++
    } else {
      const d = (g.statusDetail || '').toLowerCase()
      if (d.includes('abandon') || d.includes('no result')) {
        t[h].NR++; t[h].Pts += 4; t[a].NR++; t[a].Pts += 4
      } else if (d.includes('tied') || d.includes('tie')) {
        t[h].D++; t[h].Pts += 6; t[a].D++; t[a].Pts += 6
      } else {
        t[h].D++; t[h].Pts += 4; t[a].D++; t[a].Pts += 4
      }
    }
  }
  return Object.values(t)
    .map(row => ({ ...row, PCT: row.M > 0 ? (row.Pts / (row.M * 12)) * 100 : 0 }))
    .sort((a, b) => b.PCT - a.PCT || b.W - a.W)
}

function StandingsTab({ games }) {
  const { watchedForLeague } = useWatched()
  const watchedIds = useMemo(
    () => new Set(watchedForLeague('wtc').map(g => g.gameId)),
    [watchedForLeague]
  )
  const watchedGames = useMemo(
    () => games.filter(g => watchedIds.has(g.id) && g.status === 'final'),
    [games, watchedIds]
  )
  const standings = useMemo(() => buildStandings(watchedGames), [watchedGames])

  if (watchedGames.length === 0) {
    return (
      <EmptyState emoji="📊" title="No watched matches yet"
        message="Mark matches as watched from My Queue to build your personal WTC standings." />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-300">Points Table</h3>
            <p className="text-[10px] text-slate-600 mt-0.5">Based on your {watchedGames.length} watched test{watchedGames.length !== 1 ? 's' : ''} · Win=12 · Draw=4 · NR=4 · ranked by PCT</p>
          </div>
          <span className="text-[10px] text-sky-600">Top 2 → Final</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-600 border-b border-white/[0.04]">
                <th className="text-left px-4 py-2 w-6">#</th>
                <th className="text-left px-4 py-2">Nation</th>
                <th className="text-center px-3 py-2">M</th>
                <th className="text-center px-3 py-2">W</th>
                <th className="text-center px-3 py-2">L</th>
                <th className="text-center px-3 py-2">D</th>
                <th className="text-center px-3 py-2">NR</th>
                <th className="text-center px-3 py-2">Pts</th>
                <th className="text-center px-3 py-2 text-sky-500">PCT</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr
                  key={row.name}
                  className={`border-t border-white/[0.04] ${i < 2 ? 'text-slate-200' : 'text-slate-500'}`}
                  style={i === 1 ? { borderBottom: '1px solid rgba(14,165,233,0.18)' } : {}}
                >
                  <td className="px-4 py-3 text-slate-600 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {row.logo
                        ? <img src={row.logo} alt={row.name} className="w-6 h-6 object-contain rounded-full bg-slate-800/50" />
                        : <div className="w-6 h-6 rounded-full bg-slate-800 shrink-0" />
                      }
                      <span className="font-medium">{row.name}</span>
                      {i < 2 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide"
                          style={{ background: 'rgba(14,165,233,0.15)', color: '#0ea5e9' }}>F</span>
                      )}
                    </div>
                  </td>
                  <td className="text-center px-3 py-3 text-slate-400">{row.M}</td>
                  <td className="text-center px-3 py-3 text-emerald-400 font-medium">{row.W}</td>
                  <td className="text-center px-3 py-3 text-red-400">{row.L}</td>
                  <td className="text-center px-3 py-3 text-slate-500">{row.D}</td>
                  <td className="text-center px-3 py-3 text-slate-600">{row.NR}</td>
                  <td className="text-center px-3 py-3 font-medium">{row.Pts}</td>
                  <td className="text-center px-3 py-3 font-bold text-sky-400">{row.PCT.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {standings.length < 9 && (
          <p className="px-4 py-3 text-[11px] text-slate-600 border-t border-white/[0.04]">
            Watch more tests to see all 9 WTC nations in the table
          </p>
        )}
      </div>

      <div className="rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.12)' }}>
        <span className="text-sky-500 shrink-0 text-sm">ℹ</span>
        <p className="text-xs text-slate-500 leading-relaxed">
          PCT = Points ÷ (Matches × 12) × 100. Normalises across series of different lengths — a team that plays 2 tests isn't penalised vs one that plays 5.
          {' '}<a href="https://www.icc-cricket.com/world-test-championship" target="_blank" rel="noopener noreferrer"
            className="text-sky-500 hover:text-sky-400 underline">Official ICC standings →</a>
        </p>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'queue',      label: 'My Queue'   },
  { id: 'all',        label: 'All Tests'  },
  { id: 'watched',    label: 'Watched'    },
  { id: 'standings',  label: 'Standings'  },
]

const ENV_KEY = import.meta.env.VITE_CRICAPI_KEY || ''

function timeAgo(date) {
  if (!date) return null
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function WTCView() {
  const [apiKey, setApiKey]   = useState(() => ENV_KEY || localStorage.getItem('cricapi_key') || '')
  const [games, setGames]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [tab, setTab]         = useState('queue')
  const [updatedAt, setUpdatedAt]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshSummary, setRefreshSummary] = useState(null)

  useEffect(() => {
    if (!apiKey) return
    setLoading(true)
    setError(null)
    fetchWTCGames(apiKey)
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
      const { games, updatedAt, fetched } = await refreshWTCGames(apiKey)
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
        <div className="w-[72px] h-[72px] rounded-full bg-sky-950/40 border border-sky-900/40 flex items-center justify-center text-3xl shrink-0">🏆</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">WTC</h2>
          <p className="text-sm text-slate-500 mt-0.5">World Test Championship 2025-27</p>
        </div>
      </div>
      <div className="rounded-2xl p-8 flex flex-col items-center text-center gap-5 max-w-md mx-auto"
        style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-5xl">🏆</span>
        <div>
          <h3 className="text-lg font-semibold text-slate-200 mb-1">CricAPI Key Required</h3>
          <p className="text-sm text-slate-500">
            WTC data comes from{' '}
            <a href="https://www.cricapi.com" target="_blank" rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 underline">cricapi.com</a>.
            {' '}Get a free key (100 req/day) — no credit card needed.
          </p>
        </div>
        <div className="w-full flex flex-col gap-2">
          <input
            type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="Paste your CricAPI key here"
            className="w-full px-3 py-2.5 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            onKeyDown={e => { if (e.key === 'Enter' && apiKey.trim()) { localStorage.setItem('cricapi_key', apiKey.trim()) } }}
          />
          <button onClick={() => { const k = apiKey.trim(); if (k) { localStorage.setItem('cricapi_key', k); setApiKey(k) } }}
            disabled={!apiKey.trim()}
            className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
            Save Key & Load Tests
          </button>
        </div>
        <p className="text-xs text-slate-600">Key stored locally in your browser only · First load uses ~20-50 API calls</p>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-4 mb-7">
        <div className="w-[72px] h-[72px] rounded-full bg-sky-950/40 border border-sky-900/40 flex items-center justify-center text-3xl shrink-0">🏆</div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">WTC</h2>
          <p className="text-sm text-slate-500 mt-0.5">World Test Championship 2025-27 · All nations</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sky-800/50 bg-sky-950/30 text-sky-400 hover:bg-sky-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? (
              <>
                <span className="w-3 h-3 border border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
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

      {games.length > 0 && (
        <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5"
          style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
              style={tab === t.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
              {t.label}
              {tab === t.id && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-sky-500 rounded-full" />}
            </button>
          ))}
        </div>
      )}

      {refreshSummary && !error && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl text-sm text-emerald-400"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {refreshSummary}
        </div>
      )}

      {loading && <LoadingSpinner message="Loading WTC matches…" />}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm flex items-start gap-3">
          <span className="shrink-0">⚠</span>
          <div>
            <p className="font-medium mb-1">Failed to load WTC</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && games.length === 0 && (
        <div className="flex flex-col items-center text-center gap-3 py-16">
          <span className="text-4xl">🏆</span>
          <p className="text-slate-300 font-medium">No WTC data loaded yet</p>
          <p className="text-sm text-slate-500 max-w-xs">
            Click <span className="text-sky-400 font-medium">Update</span> above to fetch matches from CricAPI.
            First load fetches all 19 WTC series (~20-50 API calls of your 100/day).
            Subsequent loads only update new results.
          </p>
        </div>
      )}

      {!loading && !error && games.length > 0 && tab === 'queue'     && <QueueTab games={games} />}
      {!loading && !error && games.length > 0 && tab === 'all'       && <AllGamesTab games={games} />}
      {!loading && !error && games.length > 0 && tab === 'watched'   && <WatchedTab games={games} />}
      {!loading && !error && games.length > 0 && tab === 'standings' && <StandingsTab games={games} />}
    </div>
  )
}
