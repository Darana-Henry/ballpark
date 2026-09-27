import { useState, useEffect, useMemo } from 'react'
import { fetchIntlCricketGames, refreshIntlCricketGames, NATIONS, NATION_ABBR } from '../api/intlCricket'
import { withSeriesInfo, seriesYear, seriesActiveInYear, teamCode } from '../utils/cricketMatch'
import leaders from '../data/cricketLeaders.json'
import { expandTestDays, isMatchFullyWatched } from '../utils/cricketDayRows'
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

// ─── Dropdown filters ──────────────────────────────────────────────────────────
// Styled to sit alongside FormatPills as one more pill, rather than as a
// separate control pushed to the far edge of the row.

function PillSelect({ value, onChange, options }) {
  const active = value !== options[0]?.value
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={[
          'appearance-none pl-3 pr-7 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer focus:outline-none',
          active
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
            : 'bg-transparent text-slate-500 border-slate-700/50 hover:text-slate-300 hover:border-slate-600',
        ].join(' ')}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#161622] text-slate-300">{o.label}</option>
        ))}
      </select>
      <svg className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"
        fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}

const COUNTRY_OPTIONS = [
  { value: '', label: 'All Countries' },
  ...[...NATIONS].sort().map(n => ({ value: n, label: n })),
]

function CountrySelect({ value, onChange }) {
  return <PillSelect value={value} onChange={onChange} options={COUNTRY_OPTIONS} />
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
// One row per tour or tournament, oldest first, like Wikipedia's season
// overview tables. Bilateral tours get one block per match in each format
// column — green once you've watched it, grey once it's been played, outlined
// while still to come. Tri-series and tournaments, which can run to dozens of
// games, get one battery for the whole event split into the same three shades.
// The result is revealed only once the series is over and every match in it
// has been fully watched, as one compact line (full sentence on hover).

const SERIES_FORMATS = ['test', 'odi', 't20i']
const FORMAT_PLURAL = { test: 'Tests', odi: 'ODIs', t20i: 'T20Is' }

// Tallies wins by team name (not home/away role, which can vary
// match-to-match within a series). Returns the full sentence for the hover
// text and a short form with team codes for the one-line Result column.
function formatResult(matches, matchType) {
  const single = matches.length === 1
  const label = single ? FORMAT_LABEL[matchType] : FORMAT_PLURAL[matchType]

  const tally = {}
  for (const m of matches) {
    if (m.homeWon) tally[m.homeTeam.name] = (tally[m.homeTeam.name] || 0) + 1
    else if (m.awayWon) tally[m.awayTeam.name] = (tally[m.awayTeam.name] || 0) + 1
  }
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return { full: `${label}: drawn`, short: `${label} drawn` }

  const [winner, w] = entries[0]
  const l = entries[1]?.[1] ?? 0
  if (w === l) return { full: `${label}: series drawn ${w}-${l}`, short: `${label} ${w}–${l}` }
  if (single) return { full: `${label}: ${winner} won`, short: `${label} ${teamCode(winner)}` }
  return { full: `${label}: ${winner} won ${w}-${l}`, short: `${label} ${teamCode(winner)} ${w}–${l}` }
}

function bilateralResult(matches) {
  const parts = SERIES_FORMATS
    .map(t => matches.filter(m => m.matchType === t))
    .filter(ms => ms.length)
    .map(ms => formatResult(ms, ms[0].matchType))
  return { short: parts.map(p => p.short).join(' · '), full: parts.map(p => p.full).join('\n') }
}

// Tri-series and multi-nation tournaments aren't a head-to-head scoreline —
// their result is whoever won the final (or, for a round-robin with no final
// among the tracked nations, whoever won the most).
function tournamentResult(matches) {
  const final = matches.filter(m => /final$/i.test(m.gameType) && !/semi|quarter/i.test(m.gameType)).pop()
  if (final) {
    const winner = final.homeWon ? final.homeTeam.name : final.awayWon ? final.awayTeam.name : null
    return winner
      ? { short: `Won by ${teamCode(winner)}`, full: `Won by ${winner}` }
      : { short: 'Final: no result', full: 'Final: no result' }
  }
  const wins = {}
  for (const m of matches) {
    const w = m.homeWon ? m.homeTeam.name : m.awayWon ? m.awayTeam.name : null
    if (w) wins[w] = (wins[w] || 0) + 1
  }
  const [top] = Object.entries(wins).sort((a, b) => b[1] - a[1])
  return top ? { short: `Most wins: ${teamCode(top[0])} (${top[1]})`, full: `Most wins: ${top[0]} (${top[1]})` } : null
}

// Every game reaching the tabs has passed through withSeriesInfo.
const seriesKindOf = g => g.seriesKind

// "24 Sep 2026" — built by hand because en-GB's short month is "Sept".
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatStartDate(d) {
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function blockState(m, cricketWatchedIds) {
  if (m.status !== 'final') return 'upcoming'
  return isMatchFullyWatched(m, cricketWatchedIds) ? 'watched' : 'played'
}

function summarizeSeries(name, matches, cricketWatchedIds, kind) {
  const sorted = [...matches].sort((a, b) => a.gameDate - b.gameDate)
  const blocks = {}
  for (const m of sorted) {
    (blocks[m.matchType] ||= []).push({ match: m, state: blockState(m, cricketWatchedIds) })
  }
  const states = sorted.map(m => blockState(m, cricketWatchedIds))
  const fullyWatched = states.every(st => st === 'watched')
  // seriesTeams includes associates (e.g. host Namibia); older stored games
  // lack it, so fall back to the sides seen in the tracked matches.
  const teams = sorted[0].seriesTeams ?? [...new Set(sorted.flatMap(m => [m.homeTeam.name, m.awayTeam.name]))]
  // A plain year is dropped (the year dropdown shows it); a span like
  // "2026–27" stays, since it says the tour runs on into the next year.
  const title = name.replace(/, \d{4}$/, '')
  const teamCodes = kind === 'tri-series' ? `(${teams.map(teamCode).join(', ')})` : null
  return {
    key: name,
    title,
    teamCodes,
    label: teamCodes ? `${title} ${teamCodes}` : title,
    start: sorted[0].gameDate,
    blocks,
    states,
    fullyWatched,
    result: !fullyWatched ? null : kind === 'bilateral' ? bilateralResult(sorted) : tournamentResult(sorted),
  }
}

const BLOCK_CLASS = {
  watched:  'bg-emerald-500',
  played:   'bg-slate-500',
  upcoming: 'border border-slate-600',
}
const BLOCK_WORD = { watched: 'watched', played: 'played, not watched', upcoming: 'to come' }
const BLOCK_TEXT = { watched: 'text-emerald-400', played: 'text-slate-400', upcoming: 'text-slate-600' }

function countStates(states) {
  const n = { watched: 0, played: 0, upcoming: 0 }
  for (const st of states) n[st]++
  return n
}

// One battery for a whole event: green = watched, grey = played but not
// watched, empty = still to come. With showCounts, the three numbers sit
// beside it in the matching colours.
function Battery({ states, showCounts = false }) {
  const n = countStates(states)
  const pct = k => `${(n[k] / states.length) * 100}%`
  return (
    <div className="flex items-center justify-center gap-2"
      title={`${states.length} matches · ${n.watched} watched · ${n.played} played, not watched · ${n.upcoming} to come`}>
      <div className="flex items-center shrink-0">
        <div className="flex h-3.5 w-[66px] rounded-[4px] border border-slate-500 p-[2px]">
          <span className="h-full bg-emerald-500 rounded-l-[2px]" style={{ width: pct('watched') }} />
          <span className="h-full bg-slate-500" style={{ width: pct('played') }} />
        </div>
        <span className="w-[3px] h-1.5 rounded-r-sm bg-slate-500" />
      </div>
      {showCounts && (
        <span className="text-[11px] tabular-nums whitespace-nowrap">
          {['watched', 'played', 'upcoming'].map((k, i) => (
            <span key={k}>
              {i > 0 && <span className="text-slate-700"> · </span>}
              <span className={BLOCK_TEXT[k]}>{n[k]}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

// Up to five blocks, all on one line so every row stays the same height; a
// longer bilateral series (a 7-match T20I series, say) gets a battery instead.
const MAX_BLOCKS = 5

function MatchBlocks({ blocks }) {
  if (!blocks) return <span className="text-slate-700">–</span>
  if (blocks.length > MAX_BLOCKS) return <Battery states={blocks.map(b => b.state)} />
  return (
    <div className="flex gap-1 w-[66px] mx-auto">
      {blocks.map(({ match, state }) => (
        <span key={match.id}
          title={`${match.gameType} · ${formatStartDate(match.gameDate)} · ${BLOCK_WORD[state]}`}
          className={`w-2.5 h-2.5 rounded-[3px] ${BLOCK_CLASS[state]}`} />
      ))}
    </div>
  )
}

function BlockLegend() {
  return (
    <div className="flex items-center gap-4 text-[11px] text-slate-600">
      {Object.entries(BLOCK_WORD).map(([state, word]) => (
        <span key={state} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-[3px] ${BLOCK_CLASS[state]}`} />
          {word.replace(', not watched', '')}
        </span>
      ))}
    </div>
  )
}

// Tour and Result share one width: just enough for the longest tour name or
// result line, measured in the page's own font so there's no dead space.
// Start and the format columns are narrow and fixed.
const SNUG_COL_PX = 112
const PROGRESS_COL_PX = 176
const CELL_PADDING_PX = 34
let measureCtx = null
function textWidth(text, font) {
  measureCtx ||= document.createElement('canvas').getContext('2d')
  measureCtx.font = font
  return measureCtx.measureText(text).width
}
function flexColumnWidth(rows) {
  const family = getComputedStyle(document.body).fontFamily
  const widest = Math.max(
    140,
    ...rows.map(r => textWidth(r.label, `500 14px ${family}`)),
    ...rows.map(r => (r.result ? textWidth(r.result.short, `400 12px ${family}`) : 0)),
  )
  return Math.ceil(widest) + CELL_PADDING_PX
}

function TogglePill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3 py-1 rounded-full text-xs font-semibold transition-colors border',
        active
          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
          : 'bg-transparent text-slate-500 border-slate-700/50 hover:text-slate-300 hover:border-slate-600',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// kind: 'bilateral' for the Series tab, 'tri-series' / 'tournament' for the
// Tournaments tab's sub-tabs — same table, different slice of the schedule.
function SeriesTab({ games, kind = 'bilateral' }) {
  const { watchedForLeague } = useWatched()
  // Series are grouped by the year they start in, whole — a tour running
  // December to February sits under the December year with all its matches.
  const yearOptions = useMemo(() => {
    const years = [...new Set(games.filter(g => seriesKindOf(g) === kind).map(seriesYear))].sort((a, b) => b - a)
    return years.map(y => ({ value: String(y), label: String(y) }))
  }, [games, kind])
  const [year, setYear] = useState(() => String(new Date().getFullYear()))
  const [format, setFormat] = useState('all')
  const [country, setCountry] = useState('')
  const [hideWatched, setHideWatched] = useState(false)
  const cricketWatchedIds = useMemo(() => watchedForLeague('cricket').map(g => g.gameId), [watchedForLeague])

  const rows = useMemo(() => {
    const map = new Map()
    for (const g of applyCountryFilter(applyFormatFilter(games, format), country)) {
      if (seriesKindOf(g) !== kind || String(seriesYear(g)) !== year) continue
      const key = g.seriesLabel || 'Cricket'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    return [...map.entries()]
      .map(([name, matches]) => summarizeSeries(name, matches, cricketWatchedIds, kind))
      .sort((a, b) => a.start - b.start)
  }, [games, format, country, cricketWatchedIds, kind, year])

  const visible = hideWatched ? rows.filter(r => !r.fullyWatched) : rows
  const isBilateral = kind === 'bilateral'
  // Bilateral tours get a block column per format; tri-series and tournaments
  // one Progress battery for the whole event.
  const columns = !isBilateral ? [] : format === 'all' ? SERIES_FORMATS : [format]
  const hiddenCount = rows.length - visible.length
  // Sized from every row, not just visible ones, so toggling Hide watched
  // doesn't make the columns jump.
  const flexPx = useMemo(() => flexColumnWidth(rows), [rows])
  const tableWidth = flexPx * 2 + SNUG_COL_PX * (1 + columns.length) + (isBilateral ? 0 : PROGRESS_COL_PX)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {yearOptions.length > 0 && <PillSelect value={year} onChange={setYear} options={yearOptions} />}
        <FormatPills active={format} onChange={setFormat} />
        <CountrySelect value={country} onChange={setCountry} />
        <TogglePill active={hideWatched} onClick={() => setHideWatched(h => !h)}>Hide watched</TogglePill>
      </div>

      {visible.length === 0 ? (
        <EmptyState emoji="🏏" title="No series found"
          message={hiddenCount ? `All ${hiddenCount} matching series are watched.` : 'Try a different format or country filter, or refresh.'} />
      ) : (
        <div className="rounded-2xl overflow-hidden w-fit max-w-full"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: tableWidth }}>
              <colgroup>
                <col style={{ width: flexPx }} />
                <col style={{ width: SNUG_COL_PX }} />
                {columns.map(f => <col key={f} style={{ width: SNUG_COL_PX }} />)}
                {!isBilateral && <col style={{ width: PROGRESS_COL_PX }} />}
                <col style={{ width: flexPx }} />
              </colgroup>
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-600 border-b border-white/[0.06]">
                  <th className="text-left px-4 py-2.5">{isBilateral ? 'Tour' : 'Tournament'}</th>
                  <th className="text-left px-3 py-2.5">Start</th>
                  {columns.map(f => <th key={f} className="text-center px-3 py-2.5">{FORMAT_PLURAL[f]}</th>)}
                  {!isBilateral && <th className="text-center px-3 py-2.5">Progress</th>}
                  <th className="text-left px-4 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.key} className="border-t border-white/[0.04]">
                    <td className="px-4 py-2.5 text-slate-200 font-medium whitespace-nowrap overflow-hidden text-ellipsis" title={r.label}>
                      {r.title}
                      {r.teamCodes && <span className="text-slate-500 font-normal"> {r.teamCodes}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap tabular-nums">
                      {formatStartDate(r.start)}
                    </td>
                    {columns.map(f => (
                      <td key={f} className="px-3 py-2.5 text-center">
                        <MatchBlocks blocks={r.blocks[f]} />
                      </td>
                    ))}
                    {!isBilateral && (
                      <td className="px-3 py-2.5">
                        <Battery states={r.states} showCounts />
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap overflow-hidden text-ellipsis" title={r.result?.full}>
                      {r.result
                        ? <span className="text-emerald-400">{r.result.short}</span>
                        : <span className="text-slate-700">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <BlockLegend />
        {hideWatched && hiddenCount > 0 && visible.length > 0 && (
          <p className="text-xs text-slate-600">{hiddenCount} watched series hidden</p>
        )}
      </div>
    </div>
  )
}

// ─── Tournaments tab ────────────────────────────────────────────────────────────
// Tri-series and multi-nation events are one-off competitions rather than part
// of the ongoing bilateral rivalry between two nations, so they live here
// instead of the Series tab, and don't count towards Standings.

const SERIES_KINDS = [
  { id: 'bilateral',  label: 'Bilateral' },
  { id: 'tri-series', label: 'Tri-Nations' },
  { id: 'tournament', label: 'Multi-Nation' },
]
const TOURNAMENT_KINDS = SERIES_KINDS.filter(k => k.id !== 'bilateral')

function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-0.5 rounded-xl p-0.5 w-fit"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active === t.id ? 'bg-white/10 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function TournamentsTab({ games }) {
  const [kind, setKind] = useState('tri-series')
  return (
    <div className="flex flex-col gap-4">
      <SubTabs tabs={TOURNAMENT_KINDS} active={kind} onChange={setKind} />
      <SeriesTab key={kind} games={games} kind={kind} />
    </div>
  )
}

// ─── Matches tab ────────────────────────────────────────────────────────────────
// Chronological, spoiler-free watch queue. Tests are expanded into one row per
// day (see src/utils/cricketDayRows.js) — each row never carries score data,
// so GameCard has nothing to leak even once marked watched.

// One queue per series type. Home's single Up Next pick deliberately still
// spans all three (see getUpNext in HomeView.jsx).
function MatchesTab({ games, onTrack }) {
  const [kind, setKind] = useState('bilateral')
  const kindGames = useMemo(() => seriesActiveInYear(games).filter(g => seriesKindOf(g) === kind), [games, kind])
  return (
    <div className="flex flex-col gap-4">
      <SubTabs tabs={SERIES_KINDS} active={kind} onChange={setKind} />
      <MatchQueue key={kind} games={kindGames} onTrack={onTrack} />
    </div>
  )
}

function MatchQueue({ games, onTrack }) {
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
      <div className="flex items-center gap-2 flex-wrap">
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
      <div className="flex items-center gap-2 flex-wrap">
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
      seriesActiveInYear(games).filter(g => g.homeTeam.name === country || g.awayTeam.name === country),
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
      <div className="flex items-center gap-2 flex-wrap">
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
// A league table per format for one calendar year, laid out like Wikipedia's
// Premier League tables. Spoiler-safe like the Results Log: only matches
// you've fully watched count. Win 3 · Draw/Tie 1 · No result 1 · Loss 0.

const POINTS = { W: 3, D: 1, NR: 1, L: 0 }

function matchOutcome(g) {
  if (g.homeWon) return 'home'
  if (g.awayWon) return 'away'
  const d = (g.statusDetail || '').toLowerCase()
  if (d.includes('abandon') || d.includes('no result') || d.includes('cancel')) return 'nr'
  return 'draw' // drawn Tests and tied limited-overs matches
}

function buildTable(games) {
  const t = {}
  const row = team => (t[team.name] ||= { name: team.name, logo: team.logo, P: 0, W: 0, D: 0, L: 0, NR: 0, Pts: 0 })
  const add = (r, key) => { r.P++; r[key]++; r.Pts += POINTS[key] }
  for (const g of games) {
    const home = row(g.homeTeam), away = row(g.awayTeam)
    const outcome = matchOutcome(g)
    if (outcome === 'home')      { add(home, 'W'); add(away, 'L') }
    else if (outcome === 'away') { add(away, 'W'); add(home, 'L') }
    else if (outcome === 'nr')   { add(home, 'NR'); add(away, 'NR') }
    else                         { add(home, 'D'); add(away, 'D') }
  }
  return Object.values(t).sort((a, b) => b.Pts - a.Pts || b.W - a.W || a.P - b.P || a.name.localeCompare(b.name))
}

function LeagueTable({ title, rows, matchCount, year }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <p className="text-[10px] text-slate-600">
          {matchCount} watched match{matchCount !== 1 ? 'es' : ''}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-xs text-slate-600">No watched {title} in {year} yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                <th className="text-left px-4 py-2 w-8">Pos</th>
                <th className="text-left px-3 py-2">Team</th>
                <th className="text-center px-3 py-2">Pld</th>
                <th className="text-center px-3 py-2">W</th>
                <th className="text-center px-3 py-2">D</th>
                <th className="text-center px-3 py-2">L</th>
                <th className="text-center px-3 py-2">NR</th>
                <th className="text-center px-3 py-2">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className="border-t border-white/[0.04] text-slate-300">
                  <td className="px-4 py-2.5 text-slate-600 text-xs tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.logo
                        ? <img src={r.logo} alt="" className="w-5 h-5 object-contain rounded-full bg-slate-800/50" />
                        : <div className="w-5 h-5 rounded-full bg-slate-800 shrink-0" />}
                      <span className="font-medium whitespace-nowrap">{r.name}</span>
                    </div>
                  </td>
                  <td className="text-center px-3 py-2.5 tabular-nums text-slate-400">{r.P}</td>
                  <td className="text-center px-3 py-2.5 tabular-nums text-emerald-400">{r.W}</td>
                  <td className="text-center px-3 py-2.5 tabular-nums text-slate-400">{r.D}</td>
                  <td className="text-center px-3 py-2.5 tabular-nums text-red-400">{r.L}</td>
                  <td className="text-center px-3 py-2.5 tabular-nums text-slate-600">{r.NR}</td>
                  <td className="text-center px-3 py-2.5 tabular-nums font-bold text-slate-100">{r.Pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StandingsTab({ games }) {
  const { watchedForLeague } = useWatched()
  const cricketWatchedIds = useMemo(() => watchedForLeague('cricket').map(g => g.gameId), [watchedForLeague])

  // Standings go by match date, like the Leaders stats, so they cover the
  // same matches. Only the current year is offered: stored data holds whole
  // series starting last year or this year, which covers every match played
  // this year but not every match of last year.
  const currentYear = String(new Date().getFullYear())
  const yearOptions = [{ value: currentYear, label: currentYear }]
  const [year, setYear] = useState(currentYear)

  const counted = useMemo(() => games.filter(g =>
    seriesKindOf(g) === 'bilateral' &&
    String(g.gameDate.getUTCFullYear()) === year &&
    g.status === 'final' &&
    isMatchFullyWatched(g, cricketWatchedIds)
  ), [games, year, cricketWatchedIds])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <PillSelect value={year} onChange={setYear} options={yearOptions} />
        <p className="text-xs text-slate-600">Win 3 · Draw/Tie 1 · No result 1 · Loss 0 · bilateral series only · matches you've fully watched</p>
      </div>
      {SERIES_FORMATS.map(f => {
        const formatGames = counted.filter(g => g.matchType === f)
        return <LeagueTable key={f} title={FORMAT_PLURAL[f]} rows={buildTable(formatGames)} matchCount={formatGames.length} year={year} />
      })}
    </div>
  )
}

// ─── Leaders tab ───────────────────────────────────────────────────────────────
// Top 5 per format for the year, from ESPNcricinfo Statsguru: matches between
// the 12 tracked nations, all series types. Statsguru can't be read from the
// browser, so scripts/fetch-cricket-stats.mjs saves it to
// src/data/cricketLeaders.json whenever the site is deployed.

const fixed = (n, digits) => (n == null ? '–' : n.toFixed(digits))
const oppAbbr = name => NATION_ABBR[name] || name

const LEADER_SECTIONS = [
  { key: 'runs', title: 'Most Runs', columns: [
    { label: 'M',    value: r => r.matches },
    { label: 'Runs', value: r => r.runs, strong: true },
    { label: 'Ave',  value: r => fixed(r.average, 2) },
  ] },
  { key: 'wickets', title: 'Most Wickets', columns: [
    { label: 'M',    value: r => r.matches },
    { label: 'Wkts', value: r => r.wickets, strong: true },
    { label: 'SR',   value: r => fixed(r.strikeRate, 1) },
  ] },
  { key: 'innings', title: 'Highest Scores', columns: [
    { label: 'Score', value: r => r.score, strong: true },
    { label: 'Balls', value: r => r.balls ?? '–' },
    { label: 'vs',    value: r => oppAbbr(r.opposition), title: r => `v ${r.opposition}, ${r.date}` },
  ] },
  { key: 'bowling', title: 'Best Bowling', columns: [
    { label: 'Figures', value: r => r.figures, strong: true },
    { label: 'Overs',   value: r => r.overs },
    { label: 'vs',      value: r => oppAbbr(r.opposition), title: r => `v ${r.opposition}, ${r.date}` },
  ] },
]

function LeaderTable({ format, rows, columns }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="px-4 py-2.5 text-xs font-semibold text-cyan-400 border-b border-white/[0.06]">{FORMAT_PLURAL[format]}</p>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-xs text-slate-600">No {FORMAT_PLURAL[format]} yet.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              <th className="text-left pl-4 pr-1 py-2 w-6">#</th>
              <th className="text-left px-2 py-2">Player</th>
              <th className="text-left px-2 py-2">Team</th>
              {columns.map(c => <th key={c.label} className="text-right px-2 py-2 last:pr-4">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-t border-white/[0.04]">
                <td className="pl-4 pr-1 py-2 text-xs text-slate-600 tabular-nums">{i + 1}</td>
                <td className="px-2 py-2 text-slate-200 font-medium">{r.name}</td>
                <td className="px-2 py-2 text-xs text-slate-500">{r.team}</td>
                {columns.map(c => (
                  <td key={c.label} title={c.title?.(r)}
                    className={`text-right px-2 py-2 last:pr-4 tabular-nums whitespace-nowrap ${c.strong ? 'font-bold text-slate-100' : 'text-slate-400'}`}>
                    {c.value(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

function LeadersTab() {
  const fetched = new Date(leaders.fetchedAt)
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-600">
        Top 5 · {leaders.year} · matches between the 12 nations, all series · {leaders.source}, updated {formatStartDate(fetched)}
      </p>
      {LEADER_SECTIONS.map(section => (
        <section key={section.key}>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{section.title}</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {SERIES_FORMATS.map(f => (
              <LeaderTable key={f} format={f} rows={leaders.formats[f]?.[section.key] ?? []} columns={section.columns} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'series',    label: 'Series'      },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'matches',   label: 'Matches'     },
  { id: 'watched',   label: 'Watched'     },
  { id: 'results',   label: 'Results Log' },
  { id: 'standings', label: 'Standings'   },
  { id: 'leaders',   label: 'Leaders'     },
]

const AUTO_REFRESH_MS = 5 * 60 * 1000

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
  const [rawGames, setGames]        = useState([])
  const games = useMemo(() => withSeriesInfo(rawGames), [rawGames])
  const [staleNotice, setStaleNotice] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [tab, setTab]               = useState('series')
  const [updatedAt, setUpdatedAt]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshSummary, setRefreshSummary] = useState(null)
  const [trackedGame, setTrackedGame] = useState(null)

  useEffect(() => {
    fetchIntlCricketGames()
      .then(({ games, updatedAt, refreshError }) => { setGames(games); setUpdatedAt(updatedAt); setStaleNotice(refreshError ?? null) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // While the tab is open, re-check every few minutes. fetchIntlCricketGames
  // only goes back to Wikipedia once the stored copy is stale (5 min with a
  // match in progress, 30 min otherwise), so most ticks are free.
  useEffect(() => {
    const timer = setInterval(() => {
      fetchIntlCricketGames()
        .then(({ games, updatedAt, refreshError }) => { setGames(games); setUpdatedAt(updatedAt); setStaleNotice(refreshError ?? null) })
        .catch(() => { /* keep showing what we have; the next tick retries */ })
    }, AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    setError(null)
    setRefreshSummary(null)
    try {
      const { games, updatedAt, newResults, articlesFetched, migration } = await refreshIntlCricketGames()
      setGames(games)
      setUpdatedAt(updatedAt)
      setStaleNotice(null)
      const parts = [`${games.length} matches loaded`]
      parts.push(newResults > 0 ? `${newResults} new result${newResults !== 1 ? 's' : ''}` : 'no new results')
      parts.push(`${articlesFetched} tour page${articlesFetched !== 1 ? 's' : ''} read`)
      if (migration?.migrated) parts.push(`${migration.migrated} watched mark${migration.migrated !== 1 ? 's' : ''} carried over`)
      if (migration?.unmatched) parts.push(`${migration.unmatched} watched mark${migration.unmatched !== 1 ? 's' : ''} couldn't be matched (see console)`)
      setRefreshSummary(parts.join(' · '))
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

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

      {staleNotice && !error && (
        <div className="flex items-start gap-2 mb-4 px-4 py-2.5 rounded-xl text-sm text-amber-300"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <span className="shrink-0">⚠</span>
          <span>
            Couldn't update from Wikipedia ({staleNotice}). Showing the copy saved {timeAgo(updatedAt) ?? 'earlier'} — it'll retry automatically, or press Update.
          </span>
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

      {!loading && !error && tab !== 'standings' && tab !== 'leaders' && games.length === 0 && (
        <div className="flex flex-col items-center text-center gap-3 py-16">
          <span className="text-4xl">🏏</span>
          <p className="text-slate-300 font-medium">No cricket data loaded yet</p>
          <p className="text-sm text-slate-500 max-w-xs">
            Click <span className="text-cyan-400 font-medium">Update</span> above to load this year's matches from Wikipedia.
          </p>
        </div>
      )}

      {!loading && !error && tab === 'series'    && games.length > 0 && <SeriesTab games={games} />}
      {!loading && !error && tab === 'tournaments' && games.length > 0 && <TournamentsTab games={games} />}
      {!loading && !error && tab === 'matches'   && games.length > 0 && <MatchesTab games={games} onTrack={setTrackedGame} />}
      {!loading && !error && tab === 'watched'   && games.length > 0 && <WatchedTab games={games} />}
      {!loading && !error && tab === 'results'   && games.length > 0 && <ResultsLogTab games={games} />}
      {!loading && !error && tab === 'standings' && <StandingsTab games={games} />}
      {tab === 'leaders' && <LeadersTab />}

      {trackedGame && (
        <BoundaryTracker game={trackedGame} onClose={() => setTrackedGame(null)} />
      )}
    </div>
  )
}
