import { useEffect, useMemo, useState } from 'react'
import LoadingSpinner from './LoadingSpinner'
import EmptyState from './EmptyState'

// Each league's moves, written by scripts/fetch-transfers.mjs. Loaded only
// when the tab opens, so none of it is in the main bundle.
const FILES = import.meta.glob('../data/transfers/*.json')

const KIND = {
  in:        { label: 'In',        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  out:       { label: 'Out',       badge: 'bg-red-500/15 text-red-300 border-red-500/30' },
  extension: { label: 'Extended',  badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  coach:     { label: 'Coach',     badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  depth:     { label: 'Depth',     badge: 'bg-slate-500/15 text-slate-400 border-slate-600/40' },
}
const VERDICT = {
  Upgrade:   'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  Downgrade: 'text-red-300 bg-red-500/10 border-red-500/30',
  Sideways:  'text-amber-300 bg-amber-500/10 border-amber-500/30',
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'In' },
  { id: 'out', label: 'Out' },
  { id: 'extension', label: 'Extensions' },
  { id: 'coach', label: 'Coaches' },
  { id: 'trade', label: 'Trades' },
]

const fmtDate = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const windowLabel = (w, which) => `${which === 'current' ? 'Since' : ''} ${fmtDate(w.from)}${which === 'previous' ? ` – ${fmtDate(w.to)}` : ''}`.trim()

// A few plain sentences from the move's data: who, what they bring, and how
// they compare with the player they replace. Nothing here is invented: every
// clause is a field the script fetched.
function blurb(move) {
  const p = move.player ?? {}
  const parts = []
  const who = [p.age && `${p.age}`, p.position?.toLowerCase(), p.experience && `in his ${p.experience.toLowerCase()}`].filter(Boolean).join(', ')
  if (move.kind === 'in' && p.club) {
    parts.push(`${p.name}${who ? ` (${who})` : ''} joins from ${p.club}${p.clubLeague ? ` in the ${p.clubLeague}` : ''}.`)
  } else if (move.kind === 'out' && p.club) {
    parts.push(p.club === 'no club yet'
      ? `${p.name}${who ? ` (${who})` : ''} was released and has no club yet.`
      : `${p.name}${who ? ` (${who})` : ''} leaves for ${p.club}${p.clubLeague ? ` in the ${p.clubLeague}` : ''}.`)
  } else if (who && move.kind !== 'coach') {
    parts.push(`${p.name}: ${who}${p.team && move.kind === 'out' ? `, now with ${p.team}` : ''}.`)
  }
  if (p.fee && p.marketValue && p.feeValue && p.marketValueNum) {
    const ratio = p.feeValue / p.marketValueNum
    const read = ratio > 1.25 ? 'a premium on' : ratio < 0.8 ? 'below' : 'about'
    parts.push(`The fee, ${p.fee}, is ${read} his market value of ${p.marketValue}.`)
  } else if (p.fee) {
    parts.push(`Fee: ${p.fee}${p.marketValue ? `, market value ${p.marketValue}` : ''}.`)
  }
  if (p.compare?.reason) parts.push(p.compare.reason)
  return parts
}

function Row({ move, active, onClick, showTeam }) {
  const p = move.player
  const kind = KIND[move.kind] ?? KIND.depth
  const verdict = p?.compare?.verdict
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg border transition-colors ${
        active ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-slate-800 bg-[#161622] hover:border-slate-700'
      }`}
    >
      <span className={`shrink-0 w-[4.5rem] text-center text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${kind.badge}`}>
        {move.trade ? `${kind.label} · trade` : kind.label}
      </span>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm text-slate-200 font-medium truncate">
          {p?.name ?? move.text}
          {p?.position && <span className="text-slate-500 font-normal"> · {p.position}</span>}
        </span>
        <span className="text-[11px] text-slate-500 truncate">
          {showTeam && move.team ? `${move.team} · ` : ''}
          {p?.club ? `${move.kind === 'out' ? 'to' : 'from'} ${p.club}${p.fee ? ` · ${p.fee}` : ''}` : move.text}
        </span>
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        {verdict && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${VERDICT[verdict]}`}>{verdict}</span>}
        <span className="text-[10px] text-slate-600 tabular-nums">{fmtDate(move.date)}</span>
      </div>
    </button>
  )
}

function StatTable({ stats }) {
  return stats.map(s => (
    <div key={s.label} className="overflow-x-auto">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
      <table className="text-[11px] tabular-nums">
        <thead><tr>{s.values.map(([k]) => <th key={k} className="px-1.5 text-slate-500 font-semibold text-left">{k}</th>)}</tr></thead>
        <tbody><tr>{s.values.map(([k, v]) => <td key={k} className="px-1.5 text-slate-200">{v}</td>)}</tr></tbody>
      </table>
    </div>
  ))
}

function Detail({ move, onClose }) {
  const p = move.player ?? {}
  const kind = KIND[move.kind] ?? KIND.depth
  const lines = blurb(move)
  return (
    <div className="rounded-xl border border-slate-800 bg-[#161622] overflow-hidden">
      <div className="flex items-start gap-2 px-4 py-3 bg-[#1a1a28] border-b border-slate-800">
        <div className="flex flex-col min-w-0 flex-1 gap-1">
          <span className="text-base font-semibold text-slate-100">{p.name ?? 'Move'}</span>
          <span className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${kind.badge}`}>{kind.label}{move.trade ? ' · trade' : ''}</span>
            {fmtDate(move.date)}
            {p.role && <span>· {p.role}</span>}
          </span>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-200 text-lg leading-none px-1">×</button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <p className="text-xs text-slate-400 leading-relaxed">{move.text}</p>

        {p.compare?.verdict && (
          <p className={`self-start text-xs font-semibold px-2 py-1 rounded border ${VERDICT[p.compare.verdict]}`}>
            {p.compare.verdict}{p.compare.name ? ` on ${p.compare.name}` : ''}
          </p>
        )}

        {lines.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">The move</p>
            {lines.map((l, i) => <p key={i} className="text-sm text-slate-200 leading-relaxed">{l}</p>)}
          </div>
        )}

        {p.stats?.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">What he brings</p>
            <StatTable stats={p.stats} />
          </div>
        )}

        {p.note && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Why · {p.note.source}{p.note.date ? `, ${new Date(p.note.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p>
            <p className="text-sm text-slate-300 leading-relaxed">{p.note.text}</p>
          </div>
        )}

        {p.intro && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Who {p.role ? 'they are' : 'he is'} · Wikipedia</p>
            <p className="text-sm text-slate-300 leading-relaxed">{p.intro}</p>
          </div>
        )}

        {p.tmUrl && (
          <a href={p.tmUrl} target="_blank" rel="noreferrer" className="self-start text-xs text-indigo-300 hover:text-indigo-200">Transfermarkt profile ↗</a>
        )}

        {!lines.length && !p.stats?.length && !p.note && !p.intro && (
          <p className="text-xs text-slate-600">No more details for this one in the sources.</p>
        )}
      </div>
    </div>
  )
}

/**
 * The Transfers tab for one league: the team's arrivals, departures,
 * extensions and coach changes, this window or the one before, with the
 * player's details on the right. The NFL adds trades around the league; the
 * BBL is league-wide, each move tagged with its club.
 */
export default function TransfersTab({ league }) {
  const [loaded, setLoaded] = useState({ league: null, data: null, error: null })
  const [which, setWhich] = useState('current')
  const [filter, setFilter] = useState('all')
  const [showDepth, setShowDepth] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const load = FILES[`../data/transfers/${league}.json`]
  useEffect(() => {
    if (!load) return
    let cancelled = false
    load()
      .then(m => { if (!cancelled) setLoaded({ league, data: m.default ?? m, error: null }) })
      .catch(e => { if (!cancelled) setLoaded({ league, data: null, error: e.message }) })
    return () => { cancelled = true }
  }, [league, load])
  const data = loaded.league === league ? loaded.data : null
  const error = !load ? 'No transfers data for this league yet.' : loaded.league === league ? loaded.error : null

  // An empty current window (a season that's only just ended) opens on the
  // previous one instead.
  const effective = data && which === 'current' && !data.current.some(m => m.kind !== 'depth') ? 'previous' : which

  const moves = useMemo(() => {
    if (!data) return []
    return data[effective].filter(m =>
      (showDepth || m.kind !== 'depth') &&
      (filter === 'all' || (filter === 'trade' ? m.trade : m.kind === filter)))
  }, [data, effective, filter, showDepth])

  const leagueMoves = data?.leagueMoves?.[effective] ?? []
  const selected = moves.find(m => m.id === selectedId) ?? null
  const depthCount = data ? data[effective].filter(m => m.kind === 'depth').length : 0

  if (error) return <EmptyState emoji="🔁" title="No transfers yet" message={error} />
  if (!data) return <LoadingSpinner message="Loading transfers..." />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {['current', 'previous'].map(w => (
            <button key={w} onClick={() => { setWhich(w); setSelectedId(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${effective === w ? 'text-slate-100 bg-white/10' : 'text-slate-500 hover:text-slate-300'}`}>
              {w === 'current' ? 'This window' : 'Previous'}
              <span className="ml-1.5 text-[10px] text-slate-500">{windowLabel(data.windows[w], w)}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => { setFilter(f.id); setSelectedId(null) }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${filter === f.id ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {depthCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={showDepth} onChange={e => setShowDepth(e.target.checked)} className="accent-indigo-400" />
            Depth moves ({depthCount})
          </label>
        )}
      </div>

      {which === 'current' && effective === 'previous' && (
        <p className="text-xs text-slate-500">Nothing yet since {fmtDate(data.windows.current.from)}, so this shows the previous window.</p>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex flex-col gap-2 lg:w-[30rem] lg:shrink-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {data.team} · {moves.length} move{moves.length === 1 ? '' : 's'}
          </p>
          {moves.length === 0 && <p className="text-sm text-slate-600">No moves of this kind in this window.</p>}
          {moves.map(m => (
            <Row key={m.id} move={m} active={m.id === selectedId} showTeam={league === 'bbl'}
              onClick={() => setSelectedId(m.id === selectedId ? null : m.id)} />
          ))}

          {leagueMoves.length > 0 && (filter === 'all' || filter === 'trade') && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{data.leagueMoves.title} · {leagueMoves.length}</p>
              {leagueMoves.map(t => (
                <div key={t.id} className="px-3 py-2 rounded-lg border border-slate-800 bg-[#161622]">
                  <p className="text-[11px] text-slate-500"><span className="text-slate-300 font-medium">{t.team}</span> · {fmtDate(t.date)}</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{t.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="order-first lg:order-none lg:flex-1 lg:min-w-0 lg:sticky lg:top-4">
          {selected ? (
            <Detail move={selected} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="hidden lg:flex rounded-xl border border-dashed border-slate-800 p-4 text-xs text-slate-500">
              Click a move to see who the player is, what he brings and how he compares with the player he replaces.
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-slate-700">
        Updated {new Date(data.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        {' · '}upgrade / downgrade compares one number with the departure nearest in date at the same position: OPS or ERA (MLB), points per game (NBA), market value (football)
      </p>
    </div>
  )
}
