import { useState, useEffect, useMemo } from 'react'
import { EUROPE_COMPETITIONS, fetchLeaguePhaseFixtures, getSeason } from '../api/europe'
import {
  ZONES, MATCHUP_TAGS, zoneFor, groupMatchdays, currentMatchdayIndex, openingMatchdayIndex, buildTable, matchupTag,
} from '../utils/leaguePhase'
import { useMatchdayProgress } from '../hooks/useMatchdayProgress'
import { useEuropeCoverage } from '../hooks/useEuropeCoverage'
import SeasonBattery from '../components/SeasonBattery'
import RecentForm from '../components/RecentForm'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

const dayKey = date => date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
const timeOf = date => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

function formatRange(start, end) {
  const fmt = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return dayKey(start) === dayKey(end) ? fmt(start) : `${fmt(start)} – ${fmt(end)}`
}

// ─── Fixture row ──────────────────────────────────────────────────────────────

function RankBadge({ row }) {
  if (!row?.played) return <span className="w-7 shrink-0" />
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-6 rounded-md border text-[11px] font-bold tabular-nums shrink-0 ${ZONES[zoneFor(row.rank)].className}`}
      title={`#${row.rank} · ${ZONES[zoneFor(row.rank)].label} zone`}
    >
      {row.rank}
    </span>
  )
}

// Result colours match the W/D/L form boxes. Only ever set for a game the user
// has seen, so a colour can't give away a result the score is hiding.
const RESULT_NAME_CLASS = { W: 'text-emerald-400', L: 'text-slate-500', D: 'text-slate-200' }
const RESULT_SCORE_CLASS = { W: 'text-emerald-400', L: 'text-slate-500' }

function TeamSide({ team, row, align, result }) {
  const right = align === 'right'
  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 min-w-0 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <RankBadge row={row} />
      {team.logo
        ? <img src={team.logo} alt="" width={28} height={28} className="hidden sm:block w-7 h-7 object-contain shrink-0" />
        : <span className="hidden sm:block w-7 h-7 shrink-0" />}
      <div className="min-w-0">
        <p className={`text-sm font-semibold truncate ${RESULT_NAME_CLASS[result] ?? 'text-slate-200'}`}>
          {/* Short names on phones, and beside the table where the tag column squeezes the row */}
          <span className="hidden sm:inline xl:hidden 2xl:inline" title={team.name}>{team.name}</span>
          <span className="sm:hidden xl:inline 2xl:hidden" title={team.name}>{team.shortName}</span>
        </p>
        <div className={`flex items-center gap-1.5 mt-0.5 ${right ? 'justify-end' : ''}`}>
          {row?.played > 0 && (
            <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">{row.points} pts</span>
          )}
          <RecentForm form={row?.form} align={align} />
        </div>
      </div>
    </div>
  )
}

// Finished fixtures show "FT" but never the score: this is a preview, and the
// score belongs to whoever hasn't watched the highlights yet.
// `showDay` is for ranked lists, which have no day headings to say when a
// game is on.
function KickoffCell({ fixture, showDay }) {
  const day = showDay && (
    <span className="block text-[10px] font-medium text-slate-500">
      {fixture.date.toLocaleDateString('en-US', { weekday: 'short' })}
    </span>
  )
  if (fixture.status === 'live') return <>{day}<span className="text-[11px] font-bold text-red-400">LIVE</span></>
  if (fixture.status === 'final') return <>{day}<span className="text-[11px] font-semibold text-slate-500">FT</span></>
  return <>{day}<span className="text-xs font-semibold text-slate-300 tabular-nums">{timeOf(fixture.date)}</span></>
}

// Fixed-width column on the right of every row, empty or not, so rows stay
// one height and its contents line up down the list. It holds the score once
// the user has seen the game, and the matchup tag otherwise. Phones get the
// tag's emoji alone; tapping it shows the label, since there's no hover there.
function TagCell({ tag, score }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative w-8 sm:w-32 self-stretch flex items-center justify-center border-l border-white/[0.06] pl-1.5 sm:pl-3">
      {score && (score.home === score.away ? (
        <span className="text-xs sm:text-sm font-bold text-slate-100 tabular-nums whitespace-nowrap">
          {score.home}–{score.away}
        </span>
      ) : (
        <span className="text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap">
          <span className={RESULT_SCORE_CLASS[score.home > score.away ? 'W' : 'L']}>{score.home}</span>
          <span className="text-slate-500">–</span>
          <span className={RESULT_SCORE_CLASS[score.away > score.home ? 'W' : 'L']}>{score.away}</span>
        </span>
      ))}
      {!score && tag && (
        <>
          <span className={`hidden sm:inline-flex w-full items-center justify-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${tag.className}`} title={tag.hint}>
            <span>{tag.emoji}</span>{tag.label}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
            onBlur={() => setOpen(false)}
            className="sm:hidden text-sm leading-none"
            aria-label={`${tag.label}: ${tag.hint}`}
          >
            {tag.emoji}
          </button>
          {open && (
            <span className="sm:hidden absolute right-full mr-1 z-10 rounded-full bg-[#161622] shadow-lg shadow-black/50">
              <span className={`block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${tag.className}`}>
                {tag.label}
              </span>
            </span>
          )}
        </>
      )}
    </div>
  )
}

// `seen` shows the score; `ticked` is a game marked off mid-matchday, styled as
// watched. `onToggle` is only passed for rows that can be ticked.
function FixtureRow({ fixture, table, showDay, seen, ticked, onToggle }) {
  const homeRow = table.get(fixture.home.id)
  const awayRow = table.get(fixture.away.id)
  const tag = MATCHUP_TAGS[matchupTag(homeRow, awayRow)]
  const score = seen ? { home: fixture.homeScore, away: fixture.awayScore } : null
  const homeResult = score && (score.home > score.away ? 'W' : score.home < score.away ? 'L' : 'D')
  const awayResult = homeResult && ({ W: 'L', L: 'W', D: 'D' })[homeResult]

  const toggleProps = onToggle && {
    role: 'button',
    tabIndex: 0,
    'aria-pressed': ticked,
    'aria-label': `${ticked ? 'Unmark' : 'Mark'} ${fixture.home.name} v ${fixture.away.name} as watched`,
    onClick: onToggle,
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } },
  }

  return (
    <div
      {...toggleProps}
      className={`flex items-center gap-2 sm:gap-3 rounded-xl pl-3 pr-2 sm:pr-3 py-2.5 transition-colors ${ticked ? 'watched-card' : ''} ${onToggle ? 'cursor-pointer select-none hover:bg-white/[0.06]' : ''}`}
      style={ticked ? undefined : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <TeamSide team={fixture.home} row={homeRow} align="right" result={homeResult} />
        <div className="min-w-12 sm:min-w-14 text-center whitespace-nowrap"><KickoffCell fixture={fixture} showDay={showDay} /></div>
        <TeamSide team={fixture.away} row={awayRow} align="left" result={awayResult} />
      </div>
      <TagCell tag={tag} score={score} />
    </div>
  )
}

// ─── Matchday ─────────────────────────────────────────────────────────────────

function TagFilter({ counts, active, onChange }) {
  const entries = Object.entries(MATCHUP_TAGS).filter(([id]) => counts[id])
  return (
    <>
      {entries.map(([id, tag]) => (
        <button
          key={id}
          onClick={() => onChange(active === id ? null : id)}
          title={tag.hint}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold transition-opacity ${tag.className} ${active && active !== id ? 'opacity-40' : ''}`}
        >
          <span>{tag.emoji}</span>{tag.label}<span className="opacity-70 tabular-nums">{counts[id]}</span>
        </button>
      ))}
    </>
  )
}

function ZoneLegend() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 pt-3 px-1 border-t border-white/[0.07] text-[10px] text-slate-500">
      {Object.entries(ZONES).map(([id, zone], i, all) => {
        const from = i === 0 ? 1 : all[i - 1][1].maxRank + 1
        return (
          <span key={id} className="inline-flex items-center gap-1.5">
            <span className={`w-1 h-3 rounded-full ${zone.bar}`} />
            {zone.maxRank === Infinity ? `${from}+` : `${from}–${zone.maxRank}`} {zone.label}
          </span>
        )
      })}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

const panelStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }

// Width of one position-history cell plus its gap, in rem. The right-hand
// column grows by this much per completed matchday.
const HISTORY_CELL_REM = 1.25

// The table as it stood going into the matchday on screen, so it lines up with
// the ranks on the fixtures. When a tag filter is on, the teams in those
// fixtures stay lit and the rest fade back.
//
// After Pts, one zone-coloured cell per completed matchday shows the team's
// position after it, so a row reads as its climb or slide. `history` stops at
// the matchday on screen, the same point as the table, so it can't run ahead
// of what the user has watched.
function StandingsPanel({ table, history, matchdayNumber, locked, highlight }) {
  const rows = [...table.values()].sort((a, b) => a.rank - b.rank)
  const played = rows.some(r => r.played > 0)
  // No "played" column: every team has played the same number of league-phase
  // games going into a matchday, which the heading already says.
  const cols = { gridTemplateColumns: `1.5rem minmax(0,1fr) 2rem 2rem${history.length ? ' auto' : ''}` }
  const historyCells = history.length > 0 && 'flex gap-0.5 border-l border-white/[0.07] pl-1.5'

  return (
    <aside className="rounded-xl p-3" style={panelStyle}>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <p className="text-xs font-bold text-slate-300">Table</p>
        <p className="text-[10px] text-slate-500">Going into Matchday {matchdayNumber}</p>
      </div>

      {locked ? (
        <p className="text-xs text-slate-500 text-center py-8">🔒 Hidden until you've caught up</p>
      ) : !played ? (
        <p className="text-xs text-slate-500 text-center py-8">No games played yet</p>
      ) : (
        <>
          <div className="grid gap-x-2 px-1 pb-1 text-[10px] text-slate-600 font-semibold" style={cols}>
            <span>#</span><span>Team</span><span className="text-right">GD</span><span className="text-right">Pts</span>
            {historyCells && (
              <span className={historyCells}>
                {history.map((_, i) => (
                  <span key={i} className="w-[1.125rem] text-center" title={`Position after Matchday ${i + 1}`}>{i + 1}</span>
                ))}
              </span>
            )}
          </div>
          <div className="flex flex-col">
            {rows.map((row, i) => {
              const zone = zoneFor(row.rank)
              const newZone = i > 0 && zoneFor(rows[i - 1].rank) !== zone
              const gd = row.gf - row.ga
              const dim = highlight && !highlight.has(row.team.id)
              return (
                <div
                  key={row.team.id}
                  className={`relative grid gap-x-2 items-center px-1 py-0.5 text-xs tabular-nums transition-opacity ${newZone ? 'border-t border-white/10 mt-1 pt-1.5' : ''} ${dim ? 'opacity-30' : ''}`}
                  style={cols}
                  title={ZONES[zone].label}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1 h-4 rounded-full ${ZONES[zone].bar}`} />
                    <span className="text-slate-400">{row.rank}</span>
                  </span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    {row.team.logo && <img src={row.team.logo} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" />}
                    <span className="truncate text-slate-200">{row.team.shortName}</span>
                  </span>
                  <span className="text-right text-slate-500">{gd > 0 ? `+${gd}` : gd}</span>
                  <span className="text-right font-bold text-slate-100">{row.points}</span>
                  {historyCells && (
                    <span className={historyCells}>
                      {history.map((after, md) => {
                        const rank = after.get(row.team.id)?.rank
                        const prev = md > 0 ? history[md - 1].get(row.team.id)?.rank : null
                        const move = prev == null ? '' : prev > rank ? ` (▲${prev - rank})` : prev < rank ? ` (▼${rank - prev})` : ' (no change)'
                        return (
                          <span
                            key={md}
                            className={`w-[1.125rem] h-4 flex items-center justify-center rounded border text-[10px] font-bold ${ZONES[zoneFor(rank)].className}`}
                            title={`After Matchday ${md + 1}: #${rank}${move}`}
                          >
                            {rank}
                          </span>
                        )
                      })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      <ZoneLegend />
    </aside>
  )
}

// ─── Progress ─────────────────────────────────────────────────────────────────

const buttonStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }

function ProgressBar({ matchday, watchedThrough, onMark, onUnmark }) {
  if (matchday.number <= watchedThrough) {
    return (
      <div className="flex items-center justify-center gap-3 mb-4 text-xs">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-semibold">
          ✓ Watched
        </span>
        {matchday.number === watchedThrough && (
          <button onClick={onUnmark} className="text-slate-500 hover:text-slate-300 underline-offset-2 hover:underline">
            Unmark
          </button>
        )}
      </div>
    )
  }

  // Only the next unwatched matchday can be marked, and only once it's over —
  // nobody has watched games that haven't been played.
  if (matchday.number !== watchedThrough + 1) return null
  return (
    <div className="flex justify-center mb-4">
      {matchday.done ? (
        <button
          onClick={onMark}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-100 hover:bg-white/10 transition-colors"
          style={buttonStyle}
        >
          I've watched Matchday {matchday.number} ✓
        </button>
      ) : (
        <p className="text-xs text-slate-500">Matchday {matchday.number} is still being played</p>
      )}
    </div>
  )
}

function SpoilerGuard({ yourMatchday, onGoBack, onReveal }) {
  return (
    <div className="rounded-xl p-4 mb-4 text-center" style={buttonStyle}>
      <p className="text-sm font-semibold text-slate-200">🔒 Finish Matchday {yourMatchday} first</p>
      <p className="text-xs text-slate-500 mt-1">
        Ranks, form and tags here would give away Matchday {yourMatchday} results, so they're hidden.
      </p>
      <div className="flex justify-center gap-2 mt-3">
        <button onClick={onGoBack} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10" style={buttonStyle}>
          Go to Matchday {yourMatchday}
        </button>
        <button onClick={onReveal} className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300">
          Reveal anyway
        </button>
      </div>
    </div>
  )
}

// Games ticked off one by one while working through a matchday. Session memory
// only, by design: a matchday is usually watched in one sitting, and the saved
// record is the whole-matchday mark. Module scope so ticks survive switching
// to another tab and back; a reload clears them.
const tickedGames = new Set()

function MatchdayPreview({ competition, watchedThrough, setWatchedThrough }) {
  const [fixtures, setFixtures] = useState(null)
  const [error, setError]       = useState(null)
  const [index, setIndex]       = useState(null)
  const [tagFilter, setTagFilter] = useState(null)
  const [revealed, setRevealed] = useState(() => new Set())
  const [ticked, setTicked]     = useState(() => new Set(tickedGames))
  const [hideWatched, setHideWatched] = useState(false)

  const toggleTicked = id => {
    if (tickedGames.has(id)) tickedGames.delete(id)
    else tickedGames.add(id)
    setTicked(new Set(tickedGames))
  }

  useEffect(() => {
    let cancelled = false
    fetchLeaguePhaseFixtures(competition.slug)
      .then(f => { if (!cancelled) setFixtures(f) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [competition.slug])

  const matchdays = useMemo(() => (fixtures ? groupMatchdays(fixtures) : []), [fixtures])
  const selected  = index ?? openingMatchdayIndex(matchdays, watchedThrough)
  const matchday  = matchdays[selected]

  // Anything past the user's next unwatched matchday would leak its results
  // through the table, so it renders with no table at all until revealed.
  const yourMatchday = watchedThrough + 1
  const locked    = !!matchday && matchday.number > yourMatchday && !revealed.has(matchday.number)
  const table     = useMemo(
    () => (matchday && !locked ? buildTable(matchdays, matchday.number) : new Map()),
    [matchdays, matchday, locked]
  )

  // Ranked order needs a real table: a locked matchday would leak the hidden
  // ranks through the ordering, and before anyone has played there are none.
  const rankOrder = competition.sortByRank && [...table.values()].some(r => r.played > 0)

  // Once the whole matchday is marked watched every score is fair game, and
  // single-game ticks no longer mean anything there.
  const matchdayWatched = !!matchday && matchday.number <= watchedThrough

  const { byDay, counts } = useMemo(() => {
    const counts = {}
    const byDay = new Map()
    const bestRank = f => Math.min(table.get(f.home.id)?.rank ?? Infinity, table.get(f.away.id)?.rank ?? Infinity)
    const fixtures = [...(matchday?.fixtures ?? [])]
    if (rankOrder) fixtures.sort((a, b) => bestRank(a) - bestRank(b))
    for (const f of fixtures) {
      const tag = matchupTag(table.get(f.home.id), table.get(f.away.id))
      if (tag) counts[tag] = (counts[tag] ?? 0) + 1
      if (tagFilter && tag !== tagFilter) continue
      if (hideWatched && !matchdayWatched && ticked.has(f.id)) continue
      // A UEL/UECL evening in Europe can straddle midnight locally, so a ranked
      // list stays one list rather than splitting by local day.
      const key = rankOrder ? 'ranked' : dayKey(f.date)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(f)
    }
    return { byDay, counts }
  }, [matchday, table, tagFilter, rankOrder, hideWatched, matchdayWatched, ticked])

  // Tables after Matchday 1 … the one before the matchday on screen.
  const history = useMemo(() => {
    if (!matchday || locked) return []
    return Array.from({ length: matchday.number - 1 }, (_, i) => buildTable(matchdays, i + 2))
  }, [matchdays, matchday, locked])

  const highlight = useMemo(() => {
    if (!tagFilter) return null
    return new Set([...byDay.values()].flat().flatMap(f => [f.home.id, f.away.id]))
  }, [byDay, tagFilter])

  if (error) {
    return <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">Failed to load: {error}</div>
  }
  if (!fixtures) return <LoadingSpinner message={`Loading ${competition.name} fixtures...`} />
  if (!matchday) {
    return <EmptyState emoji="🏆" title="No league-phase fixtures yet" message="The draw hasn't been published for this season." />
  }

  const goTo = i => { setIndex(i); setTagFilter(null); setHideWatched(false) }
  const tickedHere = matchdayWatched ? 0 : matchday.fixtures.filter(f => ticked.has(f.id)).length
  const nobodyPlayed = !locked && [...table.values()].every(r => r.played === 0)
  const playing = matchdays[currentMatchdayIndex(matchdays)]
  const behindBy = playing.number - yourMatchday

  const mark = async () => {
    await setWatchedThrough(matchday.number)
    if (selected < matchdays.length - 1) goTo(selected + 1)
  }

  return (
    <div
      className="xl:grid xl:grid-cols-[minmax(0,1fr)_var(--table-width)] xl:gap-6 xl:items-start"
      style={{ '--table-width': `${17 + (history.length ? 0.75 + history.length * HISTORY_CELL_REM : 0)}rem` }}
    >
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            onClick={() => goTo(selected - 1)}
            disabled={selected === 0}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            aria-label="Previous matchday"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-base font-bold text-slate-100">
              Matchday {matchday.number}
              <span className="text-slate-600 font-medium"> of {matchdays.length}</span>
            </p>
            <p className="text-xs text-slate-500">{formatRange(matchday.start, matchday.end)}</p>
            {behindBy > 0 && (
              <p className="text-[11px] text-amber-400/80 mt-0.5">
                You're on Matchday {yourMatchday} · {behindBy} behind
              </p>
            )}
          </div>
          <button
            onClick={() => goTo(selected + 1)}
            disabled={selected === matchdays.length - 1}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            aria-label="Next matchday"
          >
            ›
          </button>
        </div>

        <ProgressBar
          matchday={matchday}
          watchedThrough={watchedThrough}
          onMark={mark}
          onUnmark={() => setWatchedThrough(matchday.number - 1)}
        />

        {locked && (
          <SpoilerGuard
            yourMatchday={yourMatchday}
            onGoBack={() => goTo(yourMatchday - 1)}
            onReveal={() => setRevealed(r => new Set(r).add(matchday.number))}
          />
        )}

        {nobodyPlayed && (
          <p className="text-xs text-slate-500 text-center mb-4">Opening matchday: ranks and form appear once the first games are played.</p>
        )}
        {(!locked && !nobodyPlayed) || tickedHere > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {!locked && !nobodyPlayed && <TagFilter counts={counts} active={tagFilter} onChange={setTagFilter} />}
            {tickedHere > 0 && (
              <button
                onClick={() => setHideWatched(v => !v)}
                aria-pressed={hideWatched}
                className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${hideWatched ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'text-slate-400 border-white/10 hover:text-slate-200'}`}
              >
                {hideWatched ? 'Show' : 'Hide'} watched<span className="opacity-70 tabular-nums">{tickedHere}</span>
              </button>
            )}
          </div>
        ) : null}

        {hideWatched && byDay.size === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">
            {tagFilter ? 'Every game with this tag is watched.' : 'Every game is watched. Mark the matchday above to move on.'}
          </p>
        )}

        <div className="flex flex-col gap-5">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                {rankOrder ? 'Best-ranked team first' : day}
              </p>
              <div className="flex flex-col gap-2">
                {list.map(f => {
                  const canTick = !matchdayWatched && f.status === 'final'
                  return (
                    <FixtureRow
                      key={f.id}
                      fixture={f}
                      table={table}
                      showDay={rankOrder}
                      seen={f.status === 'final' && (matchdayWatched || ticked.has(f.id))}
                      ticked={canTick && ticked.has(f.id)}
                      onToggle={canTick ? () => toggleTicked(f.id) : undefined}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>

      </div>

      <div className="mt-6 xl:mt-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto rounded-xl">
        <StandingsPanel table={table} history={history} matchdayNumber={matchday.number} locked={locked} highlight={highlight} />
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function EuropeView() {
  const [competitionId, setCompetitionId] = useState(EUROPE_COMPETITIONS[0].id)
  const competition = EUROPE_COMPETITIONS.find(c => c.id === competitionId)
  const { watchedThrough, setWatchedThrough } = useMatchdayProgress()
  const { byCompetition } = useEuropeCoverage(watchedThrough)
  const season = getSeason()

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-100 leading-tight">Europe</h2>
        <p className="text-sm text-slate-500 mt-0.5">Matchday preview · who's playing whom, and where they stand</p>
      </div>

      <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5 scrollbar-hide" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {EUROPE_COMPETITIONS.map(c => (
          <button key={c.id} onClick={() => setCompetitionId(c.id)}
            className={`relative flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${competitionId === c.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            style={competitionId === c.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
            <span className="inline-flex items-center justify-center gap-2">
              <span className="hidden sm:inline">{c.name}</span>
              <span className="sm:hidden">{c.short}</span>
              <SeasonBattery
                watched={byCompetition[c.id]?.watched ?? 0}
                total={byCompetition[c.id]?.total ?? 0}
                accentColor={c.accentColor}
                title={byCompetition[c.id] ? `${byCompetition[c.id].watched} of ${byCompetition[c.id].total} ${c.name} league-phase games watched` : undefined}
              />
            </span>
            {competitionId === c.id && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ background: c.accentColor }} />}
          </button>
        ))}
      </div>

      <MatchdayPreview
        key={competition.id}
        competition={competition}
        watchedThrough={watchedThrough(competition.id, season)}
        setWatchedThrough={matchday => setWatchedThrough(competition.id, season, matchday)}
      />
    </div>
  )
}
