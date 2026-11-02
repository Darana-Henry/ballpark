import { useEffect, useMemo, useRef, useState } from 'react'
import { useWatched } from '../contexts/WatchedContext'
import { isFirebaseConfigured } from '../firebase'
import { isMatchFullyWatched, isNotPlayed } from '../utils/cricketDayRows'
import { seriesStatus, recentForm } from '../utils/cricketSeriesStatus'
import { fetchCaptains, fetchGroundDimensions } from '../api/wikiCricket'
import { fetchMatchSummary } from '../api/espnCricket'

const GLASS = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }

function StatusLine({ status, game }) {
  if (status.kind === 'series') {
    const [home, away] = [game.homeTeam.name, game.awayTeam.name]
    const headline = status.leader
      ? `${status.leader} lead ${status.margin}`
      : `Series level ${status.margin}`
    return (
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold text-slate-100 leading-tight">{headline}</p>
        <p className="text-xs text-slate-400">
          {status.number ? `${ordinal(status.number)} ${status.format} of ${status.total}` : `${status.total}-match ${status.format} series`}
          {' · '}{home} {status.wins[home]} – {status.wins[away]} {away}
        </p>
        <p className="text-[11px] text-slate-600">
          From the {status.seen} other game{status.seen === 1 ? '' : 's'} in the series you’ve watched
          {status.unseen ? ` · ${status.unseen} played but not watched yet, not counted` : ''}
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-slate-500">Records in {status.label}, from the games you’ve watched</p>
      {status.teams.map(t => (
        <p key={t.name} className="text-sm text-slate-200 flex items-baseline gap-2">
          <span className="font-semibold">{t.name}</span>
          <span className="tabular-nums text-slate-300">{t.w}–{t.l}</span>
          {t.nr > 0 && <span className="text-[11px] text-amber-400/80">{t.nr} no result</span>}
        </p>
      ))}
      {status.seen === 0 && <p className="text-[11px] text-slate-600">None of their other games watched yet.</p>}
    </div>
  )
}

const DAY = 86400000
const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

// How long after the match you're watching it: from the match day to today
// (or to the day you marked it watched, once you have).
function WatchLag({ game, watchedAt }) {
  if (!game.gameDate) return null
  const played = dayStart(game.gameDate)
  const seen = dayStart(watchedAt ?? new Date())
  const days = Math.round((seen - played) / DAY)
  const playedOn = game.gameDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  let text
  if (game.status === 'scheduled') text = days < 0 ? `Starts in ${plural(-days, 'day')} (${playedOn})` : 'Starts today'
  else if (game.status === 'live') text = 'Being played now'
  else if (watchedAt) text = days <= 0 ? `Watched the day it was played (${playedOn})` : `Watched ${plural(days, 'day')} after it was played (${playedOn})`
  else text = days <= 0 ? `Played today (${playedOn}) · you're watching it the same day` : `Played ${plural(days, 'day')} ago (${playedOn}) · you're ${plural(days, 'day')} behind`

  return (
    <div className="mt-auto pt-2 border-t border-white/[0.06]">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Days after</p>
      <p className="text-sm text-slate-200">
        {!watchedAt && game.status === 'final' && days > 0
          ? <><span className="text-2xl font-bold tabular-nums text-amber-300">{days}</span> <span className="text-slate-400">{days === 1 ? 'day' : 'days'} after the match</span></>
          : null}
      </p>
      <p className="text-[11px] text-slate-500">{text}</p>
    </div>
  )
}

// Captains, date, ground and the ground's size, under the series score.
// Captains are the match's own from ESPN (stand-ins included) once the XIs are
// out, else the tour squad's from Wikipedia; BBL's data has neither. The size
// is the playing area from the ground's Wikipedia article, when it has one.
// The match's toss, XIs and captains from ESPN once the XIs are out; captains
// fall back to the tour squad's from Wikipedia. BBL's data has none of these.
function useMatchSummary(game) {
  const [summary, setSummary] = useState({ id: null, toss: null, xis: {}, captains: {} })
  useEffect(() => {
    let cancelled = false
    if (game.league !== 'cricket') return
    Promise.all([fetchMatchSummary(game.id), fetchCaptains(game.seriesArticle, game.matchType)])
      .then(([espn, squads]) => {
        if (cancelled) return
        const pick = team => espn.captains[team.name] ?? squads[team.name] ?? null
        setSummary({
          id: game.id,
          toss: espn.toss,
          xis: espn.xis,
          captains: { [game.homeTeam.name]: pick(game.homeTeam), [game.awayTeam.name]: pick(game.awayTeam) },
        })
      })
    return () => { cancelled = true }
  }, [game.id, game.league, game.seriesArticle, game.matchType, game.homeTeam, game.awayTeam])
  return summary.id === game.id ? summary : { toss: null, xis: {}, captains: {} }
}

function useGroundSize(venue) {
  const [size, setSize] = useState({ venue: null, dims: null })
  useEffect(() => {
    let cancelled = false
    fetchGroundDimensions(venue).then(dims => { if (!cancelled) setSize({ venue, dims }) })
    return () => { cancelled = true }
  }, [venue])
  return size.venue === venue ? size.dims : null
}

// "167 × 123 m · mid-sized · 44 m longer one way": size by the average of the
// two axes, shape by how far apart they are. Which way the pitch runs isn't in
// the data, so it can't say whether the square or straight boundaries are the
// short ones.
function describeGround({ long, short }) {
  const avg = (long + short) / 2
  const size = avg < 135 ? 'small' : avg <= 150 ? 'mid-sized' : 'large'
  const diff = long - short
  const shape = diff <= 5 ? 'close to round' : `${diff} m longer one way`
  return `${long} × ${short} m · ${size} · ${shape}`
}

function MatchInfo({ game, summary }) {
  const { captains, toss } = summary
  const dims = useGroundSize(game.venue)

  const date = game.gameDate?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const rows = [
    ...[game.homeTeam, game.awayTeam].filter(t => captains[t.name]).map(t => [`${t.abbreviation || t.name} captain`, captains[t.name]]),
    date && ['Date', date],
    game.venue && ['Ground', game.venue],
    dims && ['Ground size', describeGround(dims)],
    toss && ['Toss', toss],
  ].filter(Boolean)
  if (!rows.length) return null
  return (
    <dl className="pt-2 border-t border-white/[0.06] grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-slate-600">{label}</dt>
          <dd className={`text-slate-300 ${label === 'Toss' ? '' : 'truncate'}`} title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const FORM_DOT = {
  W:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  L:  'bg-red-500/20 text-red-300 border-red-500/40',
  NR: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
}

// One side's last five in this venue role: W / L / NR for games seen, a
// blank "?" for one played but not watched (its result stays hidden).
function FormRow({ team, form, bbl }) {
  const where = bbl ? 'last 5' : form.role === 'home' ? 'last 5 at home' : 'last 5 away'
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-slate-400 w-28 shrink-0 truncate"><span className="text-slate-200 font-medium">{team.abbreviation || team.name}</span> {where}</span>
      {form.games.length === 0
        ? <span className="text-slate-600">none in the data</span>
        : <span className="flex gap-1">
            {form.games.map(g => {
              const when = g.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              return (
                <span key={g.id}
                  title={`v ${g.opponent.name} · ${when}${g.result ? '' : ' · not watched yet'}`}
                  className={`w-5 h-5 inline-flex items-center justify-center rounded border text-[9px] font-bold ${g.result ? FORM_DOT[g.result] : 'border-dashed border-slate-600 text-slate-600'}`}>
                  {g.result ?? '?'}
                </span>
              )
            })}
          </span>}
    </div>
  )
}

function TeamForm({ game, games, isSeen }) {
  const teams = [game.homeTeam, game.awayTeam]
  const forms = useMemo(() => teams.map(t => recentForm(game, t.name, games, isSeen)), [game, games, isSeen]) // eslint-disable-line react-hooks/exhaustive-deps
  const bbl = game.league === 'bbl'
  if (!bbl && forms.every(f => !f.role)) {
    return <p className="text-[11px] text-slate-600">Form: the host isn’t known for this event, so home and away can’t be told apart.</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {teams.map((t, i) => <FormRow key={t.name} team={t} form={forms[i]} bbl={bbl} />)}
    </div>
  )
}

const ROLE_SHORT = { Batter: 'BAT', 'All-rounder': 'AR', Bowler: 'BOWL', Wicketkeeper: 'WK' }

// Both XIs in a panel that opens over the tracker's lower left. Names, roles,
// captain, keeper and debutants only: the summary's scores are never shown.
// Esc closes this first, not the whole tracker.
function PlayingXIs({ game, xis }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const teams = [game.homeTeam, game.awayTeam].filter(t => xis[t.name]?.length)

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false) } }
    const onClick = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onClick) }
  }, [open])

  if (!teams.length) return null
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.currentTarget.blur(); setOpen(o => !o) }}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors"
      >
        Playing XIs {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-20 w-[34rem] max-w-[90vw] rounded-2xl p-4 grid grid-cols-2 gap-4 shadow-2xl"
          style={{ background: '#161622', border: '1px solid rgba(255,255,255,0.12)' }}>
          {teams.map(t => (
            <div key={t.name} className="flex flex-col gap-1">
              <p className="text-xs font-bold text-slate-200 mb-1">{t.name}</p>
              {xis[t.name].map((p, i) => (
                <p key={p.name} className="text-[11px] text-slate-300 flex items-baseline gap-1.5">
                  <span className="text-slate-600 tabular-nums w-4 text-right">{i + 1}</span>
                  <span className="truncate">{p.name}</span>
                  {p.captain && <span className="text-amber-300 font-bold">(c)</span>}
                  {p.keeper && <span className="text-sky-300 font-bold">(wk)</span>}
                  {p.debut && <span className="text-emerald-300 text-[9px] font-bold uppercase">debut</span>}
                  <span className="ml-auto text-[9px] text-slate-600 shrink-0">{ROLE_SHORT[p.role] ?? ''}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/**
 * Bottom-left of the boundary tracker: mark the match watched or skip it
 * without leaving the tracker (the queue behind updates at once), and where
 * the series stands going in, from the other games the user has seen.
 * `games` is the rest of that league's schedule.
 */
export default function TrackerMatchPanel({ game, games }) {
  const { watchedGames, isWatched, isDismissed, toggleWatched, toggleDismissed, watchedForLeague } = useWatched()
  const [busy, setBusy] = useState(false)

  const watched = isWatched(game.id, game.league)
  const record = watchedGames[`${game.league}_${game.id}`]
  const watchedAt = watched && record?.updatedAt ? new Date(record.updatedAt) : null
  const dismissed = isDismissed(game.id, game.league)
  const notPlayed = isNotPlayed(game)
  const canWatch = isFirebaseConfigured && game.status === 'final' && !dismissed && !notPlayed
  const canDismiss = isFirebaseConfigured && game.status !== 'live' && !watched && !notPlayed

  const cricketWatchedIds = useMemo(() => watchedForLeague('cricket').map(g => g.gameId), [watchedForLeague])
  const isSeen = useMemo(
    () => m => isNotPlayed(m) || (m.league === 'bbl' ? isWatched(m.id, 'bbl') : isMatchFullyWatched(m, cricketWatchedIds)),
    [isWatched, cricketWatchedIds]
  )
  const status = useMemo(() => seriesStatus(game, games ?? [], isSeen), [game, games, isSeen])
  const summary = useMatchSummary(game)

  async function run(fn, e) {
    // Space is the tracker's boundary key: drop focus so the next press
    // can't click this button again.
    e?.currentTarget?.blur()
    if (busy) return
    setBusy(true)
    try { await fn(game) } finally { setBusy(false) }
  }

  return (
    <div className="shrink-0 grid grid-cols-2 gap-3">
      <div className="rounded-2xl p-3 flex flex-col gap-2" style={GLASS}>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">This match</p>
        {notPlayed ? (
          <p className="text-sm text-amber-400">Not played: counted as seen.</p>
        ) : (
          <>
            <button
              onClick={e => run(toggleWatched, e)}
              disabled={!canWatch || busy}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                watched
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/40'
                  : 'text-slate-200 border-slate-600 hover:border-emerald-500/60 hover:text-emerald-300'
              }`}
            >
              {watched ? '✓ Watched · click to undo' : 'Mark as watched'}
            </button>
            <button
              onClick={e => run(toggleDismissed, e)}
              disabled={!canDismiss || busy}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                dismissed
                  ? 'bg-red-500/15 text-red-300 border-red-500/40 hover:text-slate-200 hover:border-slate-500'
                  : 'text-slate-400 border-slate-700 hover:border-red-500/50 hover:text-red-300'
              }`}
            >
              {dismissed ? 'Not interested · click to restore' : 'Not interested'}
            </button>
            <WatchLag game={game} watchedAt={watchedAt} />
            {!isFirebaseConfigured && <p className="text-[11px] text-slate-600">Firebase isn’t set up, so marks can’t be saved.</p>}
            {isFirebaseConfigured && game.status !== 'final' && !dismissed && (
              <p className="text-[11px] text-slate-600">Mark as watched opens up once the match is over.</p>
            )}
          </>
        )}
      </div>

      <div className="rounded-2xl p-3 flex flex-col gap-2" style={GLASS}>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {status.kind === 'series' ? 'Series so far' : 'Going in'}
        </p>
        <StatusLine status={status} game={game} />
        <TeamForm game={game} games={games ?? []} isSeen={isSeen} />
        <MatchInfo game={game} summary={summary} />
        <PlayingXIs game={game} xis={summary.xis} />
      </div>
    </div>
  )
}
