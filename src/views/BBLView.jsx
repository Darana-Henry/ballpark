import { useState, useEffect, useMemo } from 'react'
import { fetchBBLGames, refreshBBLGames } from '../api/bbl'
import GameCard from '../components/GameCard'
import BoundaryTracker from '../components/BoundaryTracker'
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

// ─── Trackable card wrapper ───────────────────────────────────────────────────

function TrackableCard({ game, onTrack, isUpNext, ...props }) {
  return (
    <div className="relative">
      <GameCard game={game} isUpNext={isUpNext} {...props} />
      <button
        onClick={() => onTrack(game)}
        title="Open boundary tracker"
        className="absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg text-amber-400 z-10"
        style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
      >
        🏏 Track
      </button>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function QueueTab({ games, onTrack }) {
  const { isWatched, isDismissed } = useWatched()
  const [showWatched, setShowWatched] = useState(false)

  const { upNext, nextScheduled, unwatched, watched } = useMemo(() => {
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
    return { upNext, nextScheduled: scheduled[0] ?? null, unwatched: remaining, watched: watchedList }
  }, [games, isWatched, isDismissed])


  return (
    <div className="flex flex-col gap-3">
      {!upNext && unwatched.length === 0 && watched.length === 0 && (
        <EmptyState emoji="✅" title="All caught up" message="No unwatched BBL matches in your queue." />
      )}
      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TrackableCard game={upNext} isUpNext showDismissAction onTrack={onTrack} />
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
        {unwatched.map(g => <TrackableCard key={g.id} game={g} showDismissAction onTrack={onTrack} />)}
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
              {watched.map(g => <TrackableCard key={g.id} game={g} onTrack={onTrack} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AllGamesTab({ games, onTrack }) {
  const sorted = useMemo(() => [...games].sort((a, b) => b.gameDate - a.gameDate), [games])
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {sorted.map(g => <TrackableCard key={g.id} game={g} onTrack={onTrack} />)}
    </div>
  )
}

function WatchedTab({ games, onTrack }) {
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
            {watched.map(g => <TrackableCard key={g.id} game={g} onTrack={onTrack} />)}
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
              {skipped.map(g => <TrackableCard key={g.id} game={g} showDismissAction onTrack={onTrack} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Standings helpers ────────────────────────────────────────────────────────

function parseWinner(statusDetail, homeTeam, awayTeam) {
  if (!statusDetail) return null
  const d = statusDetail.toLowerCase()
  if (d.includes('no result') || d.includes('abandoned') || d.includes('cancelled')) return 'nr'
  if (d.includes(' tied') || d === 'match tied' || d === 'tied') return 'tie'
  const m = statusDetail.match(/^(.+?)\s+won\s+by/i)
  if (!m) return null
  const w = m[1].trim().toLowerCase()
  if (homeTeam.toLowerCase() === w || homeTeam.toLowerCase().includes(w)) return 'home'
  if (awayTeam.toLowerCase() === w || awayTeam.toLowerCase().includes(w)) return 'away'
  return null
}

function buildStandings(games) {
  const t = {}
  const ensure = (name, logo) => {
    if (!t[name]) t[name] = { name, logo, P: 0, W: 0, L: 0, NR: 0, Pts: 0, rf: 0, ra: 0 }
  }
  for (const g of games) {
    if (g.status !== 'final') continue
    const h = g.homeTeam.name, a = g.awayTeam.name
    ensure(h, g.homeTeam.logo); ensure(a, g.awayTeam.logo)
    t[h].P++; t[a].P++
    const result = parseWinner(g.statusDetail, h, a)
    if (result === 'home')      { t[h].W++; t[h].Pts += 2; t[a].L++ }
    else if (result === 'away') { t[a].W++; t[a].Pts += 2; t[h].L++ }
    else                        { t[h].NR++; t[h].Pts += 1; t[a].NR++; t[a].Pts += 1 }
    if (g.homeScore != null) { t[h].rf += g.homeScore; t[h].ra += (g.awayScore ?? 0) }
    if (g.awayScore != null) { t[a].rf += g.awayScore; t[a].ra += (g.homeScore ?? 0) }
  }
  return Object.values(t).sort((a, b) => b.Pts - a.Pts || (b.rf - b.ra) - (a.rf - a.ra))
}

// ─── Standings + Bracket tabs ─────────────────────────────────────────────────

function MatchupCard({ label, seed1, team1, seed2, team2, note, dimmed }) {
  return (
    <div className={`rounded-xl p-3 flex flex-col gap-2 transition-opacity ${dimmed ? 'opacity-35' : ''}`}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">{label}</p>
      {[{ seed: seed1, team: team1 }, { seed: seed2, team: team2 }].map(({ seed, team }, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600 w-3 shrink-0 tabular-nums">{seed}</span>
          {team.logo
            ? <img src={team.logo} alt={team.name} className="w-5 h-5 object-contain shrink-0" />
            : <div className="w-5 h-5 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
          }
          <span className={`text-sm font-medium truncate ${dimmed ? 'text-slate-500' : 'text-slate-200'}`}>{team.name}</span>
        </div>
      ))}
      {note && <p className="text-[10px] text-slate-600 mt-0.5">{note}</p>}
    </div>
  )
}

function BBLBracket({ top4 }) {
  const [s1, s2, s3, s4] = top4
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-slate-300">Finals Bracket <span className="text-slate-600 font-normal">· projected from standings</span></h3>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <MatchupCard label="Qualifier 1" seed1="1" team1={s1} seed2="2" team2={s2} note="Winner → straight to Final" />
          <MatchupCard label="Eliminator" seed1="3" team1={s3} seed2="4" team2={s4} note="Loser eliminated" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MatchupCard label="Qualifier 2" seed1="" team1={{ name: 'Q1 Loser', logo: null }} seed2="" team2={{ name: 'Elim Winner', logo: null }} note="Winner → Final" dimmed />
          <MatchupCard label="BBL Final" seed1="" team1={{ name: 'Q1 Winner', logo: null }} seed2="" team2={{ name: 'Q2 Winner', logo: null }} dimmed />
        </div>
      </div>
    </div>
  )
}

function StandingsTab({ games }) {
  const { watchedForLeague } = useWatched()
  const watchedIds = useMemo(
    () => new Set(watchedForLeague('bbl').map(g => g.gameId)),
    [watchedForLeague]
  )
  const watchedGames = useMemo(
    () => games.filter(g => watchedIds.has(g.id) && g.status === 'final'),
    [games, watchedIds]
  )
  const standings = useMemo(() => buildStandings(watchedGames), [watchedGames])

  if (watchedGames.length === 0) {
    return <EmptyState emoji="📊" title="No watched matches yet"
      message="Mark matches as watched from My Queue to build your personal points table." />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">Points Table</h3>
          <span className="text-[10px] text-slate-600">{watchedGames.length} watched match{watchedGames.length !== 1 ? 'es' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                <th className="text-left px-4 py-2 w-6">#</th>
                <th className="text-left px-4 py-2">Team</th>
                <th className="text-center px-3 py-2">P</th>
                <th className="text-center px-3 py-2">W</th>
                <th className="text-center px-3 py-2">L</th>
                <th className="text-center px-3 py-2">NR</th>
                <th className="text-center px-3 py-2 text-amber-500">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((team, i) => (
                <tr key={team.name}
                  className={`border-t border-white/[0.04] ${i < 4 ? 'text-slate-200' : 'text-slate-500'}`}
                  style={i === 3 ? { borderBottom: '1px solid rgba(245,158,11,0.15)' } : {}}>
                  <td className="px-4 py-3 text-slate-600 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {team.logo && <img src={team.logo} alt={team.name} className="w-6 h-6 object-contain" />}
                      <span className="font-medium">{team.name}</span>
                      {i < 4 && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide" style={{ background: 'rgba(245,158,11,0.15)', color: 'rgb(245,158,11)' }}>Q</span>}
                    </div>
                  </td>
                  <td className="text-center px-3 py-3 text-slate-400">{team.P}</td>
                  <td className="text-center px-3 py-3 text-emerald-400 font-medium">{team.W}</td>
                  <td className="text-center px-3 py-3 text-red-400">{team.L}</td>
                  <td className="text-center px-3 py-3 text-slate-500">{team.NR}</td>
                  <td className="text-center px-3 py-3 font-bold text-amber-400">{team.Pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {standings.length < 8 && (
          <p className="px-4 py-3 text-[11px] text-slate-600 border-t border-white/[0.04]">
            Watch more matches to see all 8 teams in the table
          </p>
        )}
      </div>

      {standings.length >= 4 && <BBLBracket top4={standings.slice(0, 4)} />}
    </div>
  )
}

// ─── Stats tab ────────────────────────────────────────────────────────────────

function StatsTab() {
  const { watchedForLeague } = useWatched()
  const watchedCount = watchedForLeague('bbl').length
  return (
    <div className="flex flex-col items-center text-center gap-3 py-16">
      <span className="text-4xl">📈</span>
      <p className="text-slate-300 font-medium">Player stats coming soon</p>
      <p className="text-sm text-slate-500 max-w-sm">
        The next <span className="text-amber-400 font-medium">Update</span> will store full match scorecards.
        After that, this tab shows top 5 run scorers and wicket takers across your
        {watchedCount > 0 ? <> <span className="text-slate-300 font-medium">{watchedCount}</span> watched</> : ' watched'} matches.
      </p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'queue',     label: 'My Queue'  },
  { id: 'all',       label: 'All Games' },
  { id: 'watched',   label: 'Watched'   },
  { id: 'standings', label: 'Standings' },
  { id: 'stats',     label: 'Stats'     },
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

export default function BBLView() {
  const [apiKey, setApiKey]   = useState(() => ENV_KEY || localStorage.getItem('cricapi_key') || '')
  const [games, setGames]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [tab, setTab]         = useState('queue')
  const [updatedAt, setUpdatedAt]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshSummary, setRefreshSummary] = useState(null)
  const [trackedGame, setTrackedGame] = useState(null)

  useEffect(() => {
    if (!apiKey) return
    setLoading(true)
    setError(null)
    fetchBBLGames(apiKey)
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
      const { games, updatedAt, fetched } = await refreshBBLGames(apiKey)
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
          <p className="text-sm text-slate-500 mt-0.5">Big Bash League · All teams</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-800/50 bg-amber-950/30 text-amber-400 hover:bg-amber-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? (
              <>
                <span className="w-3 h-3 border border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
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
          {!ENV_KEY && (
            <button onClick={() => { localStorage.removeItem('cricapi_key'); setApiKey(''); setGames([]) }}
              className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors">
              Change key
            </button>
          )}
        </div>
      </div>

      {games.length > 0 && <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5"
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            style={tab === t.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
            {t.label}
            {tab === t.id && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-amber-500 rounded-full" />}
          </button>
        ))}
      </div>}

      {refreshSummary && !error && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl text-sm text-emerald-400"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {refreshSummary}
        </div>
      )}

      {loading && <LoadingSpinner message="Loading BBL matches…" />}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm flex items-start gap-3">
          <span className="shrink-0">⚠</span>
          <div>
            <p className="font-medium mb-1">Failed to load BBL</p>
            <p>{error}</p>
            <button onClick={() => { localStorage.removeItem('cricapi_key'); setApiKey(''); setRefreshSummary(null) }}
              className="mt-2 text-xs text-red-400/70 hover:text-red-300 underline">
              Clear key and try again
            </button>
          </div>
        </div>
      )}

      {!loading && !error && games.length === 0 && (
        <div className="flex flex-col items-center text-center gap-3 py-16">
          <span className="text-4xl">🏏</span>
          <p className="text-slate-300 font-medium">No BBL data loaded yet</p>
          <p className="text-sm text-slate-500 max-w-xs">
            Click <span className="text-amber-400 font-medium">Update</span> above to fetch matches from CricAPI.
            Data is cached in Firestore so subsequent loads are free.
          </p>
        </div>
      )}

      {!loading && !error && games.length > 0 && tab === 'queue'     && <QueueTab games={games} onTrack={setTrackedGame} />}
      {!loading && !error && games.length > 0 && tab === 'all'       && <AllGamesTab games={games} onTrack={setTrackedGame} />}
      {!loading && !error && games.length > 0 && tab === 'watched'   && <WatchedTab games={games} onTrack={setTrackedGame} />}
      {!loading && !error && games.length > 0 && tab === 'standings' && <StandingsTab games={games} />}
      {!loading && !error && games.length > 0 && tab === 'stats'     && <StatsTab />}

      {trackedGame && (
        <BoundaryTracker game={trackedGame} onClose={() => setTrackedGame(null)} />
      )}
    </div>
  )
}
