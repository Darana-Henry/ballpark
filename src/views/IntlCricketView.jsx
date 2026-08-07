import { useState, useEffect, useMemo } from 'react'
import { fetchIntlCricketGames, refreshIntlCricketGames, NATIONS, NATION_ABBR } from '../api/intlCricket'
import { fetchWTCGames, refreshWTCGames } from '../api/wtc'
import { expandTestDays, isMatchWatched, isMatchFullyWatched } from '../utils/cricketDayRows'
import GameCard from '../components/GameCard'
import BoundaryTracker from '../components/BoundaryTracker'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useWatched } from '../contexts/WatchedContext'

const LEAGUE = 'cricket'

// Boundary Tracker supports both T20 (20 overs) and ODI (50 overs, grouped
// into collapsible blocks of 10 — see src/components/BoundaryTracker.jsx),
// but not Test cricket, which is multi-day/session-based rather than a fixed
// overs count, so the Track button only shows on T20I and ODI games.
const TRACKABLE_FORMATS = new Set(['t20i', 'odi'])

function TrackableGameCard({ game, onTrack, isUpNext, ...props }) {
  if (!TRACKABLE_FORMATS.has(game.matchType)) return <GameCard game={game} isUpNext={isUpNext} {...props} />
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

// ─── Format filter ─────────────────────────────────────────────────────────────

const FORMAT_FILTERS = [
  { id: 'all',   label: 'All' },
  { id: 'test',  label: 'Tests' },
  { id: 'odi',   label: 'ODIs' },
  { id: 't20i',  label: 'T20Is' },
]

const FORMAT_LABEL = { test: 'Test', odi: 'ODI', t20i: 'T20I' }

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

// ─── Country filter ────────────────────────────────────────────────────────────
// A dropdown rather than pills — 12 nations as pills would be a wall of
// buttons, so this stays a single compact control per tab.

function CountrySelect({ value, onChange, placeholder = 'All Countries' }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-transparent text-slate-300 border border-slate-700/50 focus:outline-none focus:border-cyan-500/40 hover:border-slate-600 transition-colors cursor-pointer"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <option value="" className="bg-[#161622] text-slate-300">{placeholder}</option>
      {NATIONS.map(n => (
        <option key={n} value={n} className="bg-[#161622] text-slate-300">{n}</option>
      ))}
    </select>
  )
}

function applyCountryFilter(games, country) {
  if (!country) return games
  return games.filter(g => g.homeTeam.name === country || g.awayTeam.name === country)
}

// No single followed nation, so the win/loss color is anchored to the home
// team of each match. Test day-rows are excluded — they're synthetic
// spoiler-safe placeholders (see cricketDayRows.js) and never carry a real
// homeWon/awayWon result, so coloring them would either show nothing or, if
// they ever did carry data, leak the outcome before the match is truly over.
function getResult(game) {
  if (game.matchType === 'test') return null
  if (game.homeWon) return 'win'
  if (game.awayWon) return 'loss'
  return null
}

// ─── Series tab ─────────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

// Groups matches by format and tallies wins by team name (not home/away role,
// which can vary match-to-match within a series) to describe the result of
// each format played. Only called once every match in the series has been
// watched — this is the spoiler-reveal step, not the default.
function formatResultLine(matches, matchType) {
  const single = matches.length === 1
  const label = single
    ? { test: 'Test', odi: 'ODI', t20i: 'T20I' }[matchType]
    : { test: 'Tests', odi: 'ODIs', t20i: 'T20Is' }[matchType]

  const tally = {}
  for (const m of matches) {
    if (m.homeWon) tally[m.homeTeam.name] = (tally[m.homeTeam.name] || 0) + 1
    else if (m.awayWon) tally[m.awayTeam.name] = (tally[m.awayTeam.name] || 0) + 1
  }
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return `${label}: drawn`

  const [winner, winCount] = entries[0]
  const loseCount = entries[1]?.[1] ?? 0
  if (winCount === loseCount) return `${label}: series drawn ${winCount}-${loseCount}`
  return single ? `${label}: ${winner} won` : `${label}: ${winner} won ${winCount}-${loseCount}`
}

function buildResultSummary(matches) {
  const byType = new Map()
  for (const m of matches) {
    if (!byType.has(m.matchType)) byType.set(m.matchType, [])
    byType.get(m.matchType).push(m)
  }
  return [...byType.entries()].map(([type, ms]) => formatResultLine(ms, type))
}

// Schedule/progress only, UNLESS the series is both finished in real life and
// every one of its matches has been watched — only then does it reveal the
// actual result. Never reveals a score, result, or series leader otherwise.
function seriesProgress(matches, today, cricketWatchedIds) {
  const sorted = [...matches].sort((a, b) => a.gameDate - b.gameDate)
  const live = sorted.filter(m => m.status === 'live')
  const scheduled = sorted.filter(m => m.status === 'scheduled')
  const completedCount = sorted.filter(m => m.status === 'final').length
  const lastDate = sorted[sorted.length - 1]?.gameDate ?? today

  if (live.length > 0) {
    const m = live[0]
    const idx = sorted.indexOf(m) + 1
    const label = FORMAT_LABEL[m.matchType] || m.matchType
    if (m.matchType === 'test') {
      const dayNum = Math.min(5, Math.max(1, Math.floor((today - m.gameDate) / 86400000) + 1))
      return { state: 'live', text: `${ordinal(idx)} ${label} in progress · Day ${dayNum} of 5`, sortDate: today }
    }
    return { state: 'live', text: `${ordinal(idx)} ${label} · Live now`, sortDate: today }
  }
  if (scheduled.length > 0) {
    const m = scheduled[0]
    const idx = sorted.indexOf(m) + 1
    const label = FORMAT_LABEL[m.matchType] || m.matchType
    const dateStr = m.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { state: 'upcoming', text: `Next: ${ordinal(idx)} ${label} · ${dateStr}`, sortDate: m.gameDate }
  }

  const allWatched = sorted.every(m => isMatchWatched(m, cricketWatchedIds))
  if (allWatched) {
    return { state: 'done', lines: buildResultSummary(sorted), sortDate: lastDate }
  }
  return {
    state: 'completed',
    text: `Series complete · ${completedCount} match${completedCount !== 1 ? 'es' : ''}`,
    sortDate: lastDate,
  }
}

const SERIES_STATE_STYLE = {
  live:      'bg-red-500/10 text-red-400 border-red-500/25',
  upcoming:  'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
  completed: 'bg-slate-700/20 text-slate-500 border-slate-700/40',
  done:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
}

function SeriesCard({ seriesName, matches, cricketWatchedIds }) {
  const today = new Date()
  const sorted = [...matches].sort((a, b) => a.gameDate - b.gameDate)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  const formatCounts = {}
  for (const m of matches) formatCounts[m.matchType] = (formatCounts[m.matchType] || 0) + 1
  const formatTags = Object.entries(formatCounts)
    .map(([type, count]) => `${count} ${FORMAT_LABEL[type] || type}${count !== 1 ? 's' : ''}`)
    .join(' · ')

  const lastEnd = last.matchType === 'test'
    ? new Date(last.gameDate.getTime() + 4 * 86400000)
    : last.gameDate
  const rangeStr = `${first.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lastEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const progress = seriesProgress(matches, today, cricketWatchedIds)

  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-slate-100 truncate">{seriesName}</p>
          <p className="text-xs text-slate-600 mt-0.5">{formatTags} · {rangeStr}</p>
        </div>
        <span className="text-xs text-slate-500 shrink-0">
          {first.awayTeam.abbreviation} vs {first.homeTeam.abbreviation}
        </span>
      </div>
      {progress.state === 'done' ? (
        <div className="flex flex-col gap-1 items-start">
          {progress.lines.map((line, i) => (
            <span key={i} className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border ${SERIES_STATE_STYLE.done}`}>
              {line}
            </span>
          ))}
        </div>
      ) : (
        <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border ${SERIES_STATE_STYLE[progress.state]}`}>
          {progress.state === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 live-pulse mr-1.5" />}
          {progress.text}
        </span>
      )}
    </div>
  )
}

// live/upcoming come first (still in play); completed and done share the last
// tier — a fully-revealed series and a still-locked one are equally "nothing
// left to do here," tie-broken by most-recently-finished.
const SERIES_SORT_ORDER = { live: 0, upcoming: 1, completed: 2, done: 2 }

function SeriesTab({ games }) {
  const { watchedForLeague } = useWatched()
  const [format, setFormat] = useState('all')
  const [country, setCountry] = useState('')
  const filtered = useMemo(
    () => applyCountryFilter(applyFormatFilter(games, format), country),
    [games, format, country]
  )
  const cricketWatchedIds = useMemo(() => watchedForLeague('cricket').map(g => g.gameId), [watchedForLeague])

  const bySeries = useMemo(() => {
    const map = new Map()
    for (const g of filtered) {
      const key = g.seriesLabel || 'Cricket'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    const today = new Date()
    return [...map.entries()]
      .map(([name, matches]) => ({ name, matches, progress: seriesProgress(matches, today, cricketWatchedIds) }))
      .sort((a, b) => {
        if (SERIES_SORT_ORDER[a.progress.state] !== SERIES_SORT_ORDER[b.progress.state]) {
          return SERIES_SORT_ORDER[a.progress.state] - SERIES_SORT_ORDER[b.progress.state]
        }
        return SERIES_SORT_ORDER[a.progress.state] === 2
          ? b.progress.sortDate - a.progress.sortDate
          : a.progress.sortDate - b.progress.sortDate
      })
  }, [filtered, cricketWatchedIds])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <FormatPills active={format} onChange={setFormat} />
        <CountrySelect value={country} onChange={setCountry} />
      </div>

      {bySeries.length === 0 && (
        <EmptyState emoji="🏏" title="No series found" message="Try a different format or country filter, or refresh." />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {bySeries.map(({ name, matches }) => (
          <SeriesCard key={name} seriesName={name} matches={matches} cricketWatchedIds={cricketWatchedIds} />
        ))}
      </div>
    </div>
  )
}

// ─── Matches tab ────────────────────────────────────────────────────────────────
// Chronological, spoiler-free watch queue. Tests are expanded into one row per
// day (see src/utils/cricketDayRows.js) — each row never carries score data,
// so GameCard has nothing to leak even once marked watched.

function MatchesTab({ games, onTrack }) {
  const { isWatched, isDismissed } = useWatched()
  const [format, setFormat] = useState('all')
  const [country, setCountry] = useState('')

  const expanded = useMemo(() => expandTestDays(games), [games])
  const filtered = useMemo(
    () => applyCountryFilter(applyFormatFilter(expanded, format), country),
    [expanded, format, country]
  )

  const { upNext, unwatched } = useMemo(() => {
    const live = filtered.filter(g => g.status === 'live' && !isDismissed(g.id, LEAGUE))
    const finalUnwatched = filtered
      .filter(g => g.status === 'final' && !isWatched(g.id, LEAGUE) && !isDismissed(g.id, LEAGUE))
      .sort((a, b) => a.gameDate - b.gameDate)
    const scheduled = filtered
      .filter(g => g.status === 'scheduled' && !isDismissed(g.id, LEAGUE))
      .sort((a, b) => a.gameDate - b.gameDate)

    const upNext   = finalUnwatched[0] ?? live[0] ?? scheduled[0]
    const upNextId = upNext?.id
    const remaining = [
      ...finalUnwatched.filter(g => g.id !== upNextId),
      ...live.filter(g => g.id !== upNextId),
      ...scheduled.filter(g => g.id !== upNextId),
    ]
    return { upNext, unwatched: remaining }
  }, [filtered, isWatched, isDismissed])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <FormatPills active={format} onChange={setFormat} />
        <CountrySelect value={country} onChange={setCountry} />
      </div>

      {!upNext && unwatched.length === 0 && (
        <EmptyState emoji="✅" title="All caught up" message="No unwatched international matches in your queue." />
      )}

      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TrackableGameCard game={upNext} isUpNext showDismissAction onTrack={onTrack} />
            <div className="rounded-2xl p-5 flex flex-col gap-2"
              style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}>
              <p className="text-cyan-400 font-semibold text-sm">Cricket</p>
              <p className="text-slate-500 text-xs leading-relaxed">
                All formats — Tests, ODIs, and T20Is — between the 12 Full Member nations.
                Tests are split into one row per day, so you can watch and check them off without spoilers.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {NATIONS.map(n => (
                  <span key={n} className="text-[10px] font-bold px-1.5 py-0.5 rounded text-slate-600 bg-slate-800/60">{NATION_ABBR[n]}</span>
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
        {unwatched.map(g => <TrackableGameCard key={g.id} game={g} showDismissAction onTrack={onTrack} />)}
      </div>
    </div>
  )
}

// ─── Watched tab ────────────────────────────────────────────────────────────────
// Every match/day you've marked watched, across all formats. Split out from
// Matches (which is now purely the unwatched queue) into its own tab.

function WatchedTab({ games }) {
  const { isWatched } = useWatched()
  const [format, setFormat] = useState('all')
  const [country, setCountry] = useState('')

  const expanded = useMemo(() => expandTestDays(games), [games])
  const filtered = useMemo(
    () => applyCountryFilter(applyFormatFilter(expanded, format), country),
    [expanded, format, country]
  )
  const watchedFlat = useMemo(
    () => filtered.filter(g => isWatched(g.id, LEAGUE)),
    [filtered, isWatched]
  )

  // Grouped by series, series ordered reverse chronological (most recent
  // match first), cards within each series chronological (oldest first) —
  // so a series reads top-to-bottom in the order it was actually played.
  const bySeries = useMemo(() => {
    const map = new Map()
    for (const g of watchedFlat) {
      const key = g.seriesLabel || 'Cricket'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    return [...map.entries()]
      .map(([name, matches]) => ({
        name,
        matches: [...matches].sort((a, b) => a.gameDate - b.gameDate),
        lastDate: Math.max(...matches.map(m => m.gameDate.getTime())),
      }))
      .sort((a, b) => b.lastDate - a.lastDate)
  }, [watchedFlat])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <FormatPills active={format} onChange={setFormat} />
        <CountrySelect value={country} onChange={setCountry} />
      </div>

      {watchedFlat.length === 0 ? (
        <EmptyState emoji="✅" title="No watched matches yet" message="Mark matches as watched from the Matches tab." />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl px-4 py-2 w-fit"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-cyan-400 font-bold text-lg">{watchedFlat.length}</span>
            <span className="text-slate-600 text-sm">watched</span>
          </div>
          <div className="flex flex-col gap-6">
            {bySeries.map(({ name, matches }) => (
              <div key={name}>
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest shrink-0">{name}</p>
                  <div className="flex-1 border-t border-cyan-900/40" />
                  <span className="text-[10px] text-slate-700 shrink-0">{matches.length} watched</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {matches.map(g => <GameCard key={g.id} game={g} resultColor={getResult(g)} />)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Results Log tab ────────────────────────────────────────────────────────────
// Every match a selected country has played — past and upcoming — laid out
// as the same GameCard grid as the Watched tab. Unlike Watched, unwatched
// and future games still show up here (as plain, uncolored cards), but only
// ones you've actually watched get win/loss colored relative to the
// selected country. A Test only counts as watched once every one of its 5
// day-rows is checked off (isMatchFullyWatched) — same spoiler-safe rule
// used elsewhere — since GameCard's own isWatched check is keyed to
// day-row ids for Tests, not the whole match's id, forceWatched is what
// actually reveals the score/win-loss styling once that gate passes.

function countryResultColor(game, country) {
  const countryWon = (game.homeTeam.name === country && game.homeWon) ||
                      (game.awayTeam.name === country && game.awayWon)
  if (countryWon) return 'win'
  const countryLost = (game.homeTeam.name === country && game.awayWon) ||
                       (game.awayTeam.name === country && game.homeWon)
  return countryLost ? 'loss' : null
}

function RecordBadge({ wins, losses }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 w-fit"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className="text-slate-100 font-bold text-lg tabular-nums">{wins}</span>
      <span className="text-slate-500 text-sm font-semibold">W</span>
      <span className="text-slate-700">·</span>
      <span className="text-red-400 font-bold text-lg tabular-nums">{losses}</span>
      <span className="text-slate-500 text-sm font-semibold">L</span>
    </div>
  )
}

function ResultsLogTab({ games }) {
  const { watchedForLeague } = useWatched()
  const [format, setFormat] = useState('all')
  const [country, setCountry] = useState('')
  const cricketWatchedIds = useMemo(() => watchedForLeague('cricket').map(g => g.gameId), [watchedForLeague])

  const countryGames = useMemo(() => {
    if (!country) return []
    return applyFormatFilter(
      games.filter(g => g.homeTeam.name === country || g.awayTeam.name === country),
      format
    ).sort((a, b) => a.gameDate - b.gameDate)
  }, [games, country, format])

  const record = useMemo(() => {
    let wins = 0, losses = 0
    for (const g of countryGames) {
      if (g.status !== 'final' || !isMatchFullyWatched(g, cricketWatchedIds)) continue
      const result = countryResultColor(g, country)
      if (result === 'win') wins++
      else if (result === 'loss') losses++
    }
    return { wins, losses }
  }, [countryGames, cricketWatchedIds, country])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <FormatPills active={format} onChange={setFormat} />
        <CountrySelect value={country} onChange={setCountry} />
      </div>

      {!country && (
        <EmptyState emoji="🏆" title="Pick a country"
          message="Select a nation above to see every match they've played — the ones you've watched are revealed in color." />
      )}

      {country && countryGames.length === 0 && (
        <EmptyState emoji="🏆" title="No matches found" message={`No ${country} matches loaded yet.`} />
      )}

      {countryGames.length > 0 && (
        <>
          <RecordBadge wins={record.wins} losses={record.losses} />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {countryGames.map(g => {
              const revealed = g.status === 'final' && isMatchFullyWatched(g, cricketWatchedIds)
              return (
                <GameCard
                  key={g.id}
                  game={g}
                  resultColor={revealed ? countryResultColor(g, country) : null}
                  forceWatched={revealed}
                  readOnly
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Standings tab ────────────────────────────────────────────────────────────
// Ported from the old standalone WTCView. Uses its own CricAPI cache (the full
// 2025-27 WTC cycle spans years, unlike the year-scoped Matches/Series data) and
// its own refresh control, since it's a separate API cost.

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

function StandingsTable({ standings, watchedCount }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Points Table</h3>
          <p className="text-[10px] text-slate-600 mt-0.5">Based on your {watchedCount} watched test{watchedCount !== 1 ? 's' : ''} · Win=12 · Draw=4 · NR=4 · ranked by PCT</p>
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
  )
}

function wtcTimeAgo(date) {
  if (!date) return null
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StandingsTab({ apiKey }) {
  const { isWatched, watchedForLeague } = useWatched()
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchWTCGames(apiKey)
      .then(({ games, updatedAt }) => { setGames(games); setUpdatedAt(updatedAt) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [apiKey])

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      const { games, updatedAt } = await refreshWTCGames(apiKey)
      setGames(games)
      setUpdatedAt(updatedAt)
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  // A WTC test counts as "watched" for standings either via the legacy direct
  // toggle (isWatched(id, 'wtc') — how the old standalone WTC tab recorded it),
  // or — for matches also covered by the year-scoped Matches tab — if any of
  // its day-rows have been checked off there. This avoids double-marking the
  // same real match as watched in two places.
  const watchedGames = useMemo(() => {
    const cricketWatchedIds = watchedForLeague('cricket').map(g => g.gameId)
    return games.filter(g =>
      g.status === 'final' &&
      (isWatched(g.id, 'wtc') || isMatchWatched(g, cricketWatchedIds))
    )
  }, [games, isWatched, watchedForLeague])

  const standings = useMemo(() => buildStandings(watchedGames), [watchedGames])
  const sequence = useMemo(() => [...watchedGames].sort((a, b) => a.gameDate - b.gameDate), [watchedGames])

  if (loading) return <LoadingSpinner message="Loading WTC standings…" />
  if (error) return (
    <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm flex items-start gap-3">
      <span className="shrink-0">⚠</span>
      <div>
        <p className="font-medium mb-1">Failed to load WTC standings</p>
        <p>{error}</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          World Test Championship 2025-27 · 9 nations
          {updatedAt && <span className="text-slate-700"> · updated {wtcTimeAgo(updatedAt)}</span>}
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sky-800/50 bg-sky-950/30 text-sky-400 hover:bg-sky-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {refreshing ? (
            <>
              <span className="w-3 h-3 border border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
              Updating…
            </>
          ) : 'Update Standings'}
        </button>
      </div>

      {watchedGames.length === 0 ? (
        <EmptyState emoji="📊" title="No watched WTC tests yet"
          message="Mark WTC test days as watched from the Matches tab to build your personal standings." />
      ) : (
        <>
          <StandingsTable standings={standings} watchedCount={watchedGames.length} />

          <div className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.12)' }}>
            <span className="text-sky-500 shrink-0 text-sm">ℹ</span>
            <p className="text-xs text-slate-500 leading-relaxed">
              PCT = Points ÷ (Matches × 12) × 100. Normalises across series of different lengths — a team that plays 2 tests isn't penalised vs one that plays 5.
              {' '}<a href="https://www.icc-cricket.com/world-test-championship" target="_blank" rel="noopener noreferrer"
                className="text-sky-500 hover:text-sky-400 underline">Official ICC standings →</a>
            </p>
          </div>

          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Results That Built This Table</p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {sequence.map(g => <GameCard key={g.id} game={g} />)}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'series',    label: 'Series'      },
  { id: 'matches',   label: 'Matches'     },
  { id: 'watched',   label: 'Watched'     },
  { id: 'results',   label: 'Results Log' },
  { id: 'standings', label: 'Standings'   },
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
  const [tab, setTab]               = useState('series')
  const [updatedAt, setUpdatedAt]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshSummary, setRefreshSummary] = useState(null)
  const [trackedGame, setTrackedGame] = useState(null)

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
      const { games, updatedAt, fetched, resolved, pendingResolution } = await refreshIntlCricketGames(apiKey)
      setGames(games)
      setUpdatedAt(updatedAt)
      const parts = [`${games.length} matches loaded`]
      parts.push(fetched > 0 ? `${fetched} new score${fetched !== 1 ? 's' : ''} fetched` : 'all scores already cached')
      if (resolved > 0) parts.push(`${resolved} new series discovered`)
      if (pendingResolution > 0) parts.push(`${pendingResolution} series left to discover — click Update again to continue`)
      setRefreshSummary(parts.join(' · '))
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
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">Cricket</h2>
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
            {' '}Get a free key (100 req/day) — it powers Series, Matches, and Standings below.
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
        <p className="text-xs text-slate-600">Key stored locally in your browser only · Discovering the full year's schedule takes ~5 Update clicks (~15-25 calls each) from your 100/day free quota</p>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-7">
        <div className="w-[72px] h-[72px] rounded-full bg-cyan-950/40 border border-cyan-900/40 flex items-center justify-center text-3xl shrink-0">🏏</div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">Cricket</h2>
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

      {!loading && !error && tab !== 'standings' && games.length === 0 && (
        <div className="flex flex-col items-center text-center gap-3 py-16">
          <span className="text-4xl">🏏</span>
          <p className="text-slate-300 font-medium">No cricket data loaded yet</p>
          <p className="text-sm text-slate-500 max-w-xs">
            Click <span className="text-cyan-400 font-medium">Update</span> above to fetch matches from CricAPI.
            Uses ~15-25 API calls per click while the year's series are being discovered (~5 clicks total), then far fewer on later refreshes.
          </p>
        </div>
      )}

      {!loading && !error && tab === 'series'    && games.length > 0 && <SeriesTab games={games} />}
      {!loading && !error && tab === 'matches'   && games.length > 0 && <MatchesTab games={games} onTrack={setTrackedGame} />}
      {!loading && !error && tab === 'watched'   && games.length > 0 && <WatchedTab games={games} />}
      {!loading && !error && tab === 'results'   && games.length > 0 && <ResultsLogTab games={games} />}
      {!loading && !error && tab === 'standings' && <StandingsTab apiKey={apiKey} />}

      {trackedGame && (
        <BoundaryTracker game={trackedGame} onClose={() => setTrackedGame(null)} />
      )}
    </div>
  )
}
