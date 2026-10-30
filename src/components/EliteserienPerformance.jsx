import { useState, useRef, useEffect } from 'react'
import history from '../data/eliteserienHistory.json'

// The user's seasons side by side: this one against the last one with
// round-by-round data, and every season's final rank and points. The archive
// is src/data/eliteserienHistory.json (see the fetch script).

const SEASONS = history.seasons
const ROUND_SEASONS = Object.keys(history.rounds).sort()
const CURRENT = ROUND_SEASONS.at(-1)
const PREVIOUS = ROUND_SEASONS.at(-2)
// Validated categorical slots 1 and 2 for the dark surface.
const COLORS = { [CURRENT]: '#3987e5', [PREVIOUS]: '#d95926' }
const panelStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
const num = n => n.toLocaleString('en-US')

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/**
 * Line chart with a crosshair: `series` is `[{ key, label, color, points: [{ x, y }] }]`.
 * `log` and `invert` are for ranks (1 at the top, spread on a log scale).
 * `xLabel(x)` names an x position; `format(y)` a value.
 */
function LineChart({ series, xs, xLabel, format, log, invert, height = 220, ticks, everyX, markers }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const pad = { top: 12, right: 52, bottom: 24, left: 48 }
  const w = Math.max(200, width) - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const all = series.flatMap(s => s.points.map(p => p.y))
  const t = v => (log ? Math.log10(v) : v)
  const [lo, hi] = [Math.min(...all), Math.max(...all)]
  const [min, max] = log ? [t(lo) - 0.05, t(hi) + 0.05] : [0, hi * 1.05]
  const y = v => {
    const f = (t(v) - min) / (max - min || 1)
    return pad.top + (invert ? f : 1 - f) * h
  }
  const x = v => pad.left + ((v - xs[0]) / (xs.at(-1) - xs[0] || 1)) * w
  // Round steps (250, 500, 1000…) for a linear axis.
  const step = [1, 2, 2.5, 5].map(m => m * 10 ** Math.floor(Math.log10(max / 4 || 1))).find(st => max / st <= 5) ?? 10 ** Math.ceil(Math.log10(max / 4 || 1))
  const yTicks = ticks ?? Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)

  // First, last and every fifth, dropping one that would crowd the last.
  const xTicks = xs.filter((v, i) => everyX || i === 0 || i === xs.length - 1 || v % 5 === 0)
    .filter((v, i, list) => i === list.length - 1 || x(list.at(-1)) - x(v) >= 30)

  const onMove = e => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left
    const nearest = xs.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a), xs[0])
    setHover(nearest)
  }

  return (
    <div ref={ref} className="relative">
      <svg width={Math.max(200, width)} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-pan-y">
        {yTicks.map(v => (
          <g key={v}>
            <line x1={pad.left} x2={pad.left + w} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={pad.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize="10" fill="#64748b">{format(v)}</text>
          </g>
        ))}
        {xTicks.map(v => (
          <text key={v} x={x(v)} y={height - 6} textAnchor="middle" fontSize="10" fill="#64748b">{xLabel(v)}</text>
        ))}
        {series.map(s => (
          <path key={s.key} d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join('')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {markers && series.map(s => s.points.map(p => (
          <circle key={`${s.key}-${p.x}`} cx={x(p.x)} cy={y(p.y)} r="4" fill={s.color} stroke="#0d0d14" strokeWidth="2" />
        )))}
        {/* Direct labels at each line's end; one series is named by the title */}
        {series.length > 1 && series.map(s => {
          const last = s.points.at(-1)
          return last && <text key={s.key} x={x(last.x) + 6} y={y(last.y)} dy="0.32em" fontSize="11" fontWeight="600" fill="#cbd5e1">{s.label}</text>
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} stroke="rgba(255,255,255,0.25)" />
            {series.map(s => {
              const p = s.points.find(q => q.x === hover)
              return p && <circle key={s.key} cx={x(p.x)} cy={y(p.y)} r="4" fill={s.color} stroke="#0d0d14" strokeWidth="2" />
            })}
          </g>
        )}
      </svg>
      {hover != null && (
        <div
          className="absolute top-2 pointer-events-none rounded-lg px-2.5 py-1.5 text-xs shadow-lg bg-slate-900/95 border border-white/10"
          style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}
        >
          <p className="font-semibold text-slate-200 mb-0.5">{xLabel(hover)}</p>
          {series.map(s => {
            const p = s.points.find(q => q.x === hover)
            return (
              <p key={s.key} className="flex items-center gap-1.5 text-slate-300 whitespace-nowrap">
                <span className="w-2.5 h-0.5 rounded" style={{ background: s.color }} />
                {s.label}: <span className="font-semibold text-slate-100 tabular-nums">{p ? format(p.y) : '–'}</span>
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Legend({ items }) {
  return (
    <div className="flex gap-3 text-[11px] text-slate-400">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  )
}

const rankTicks = (values) => {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter(v => v >= lo * 0.8 && v <= hi * 1.25)
}

export default function EliteserienPerformance() {
  if (!CURRENT) return <p className="text-sm text-slate-500 text-center py-10">No season history yet.</p>

  const now = history.rounds[CURRENT]
  const last = PREVIOUS ? history.rounds[PREVIOUS] : []
  const round = now.at(-1)?.round ?? 0
  const then = last.find(r => r.round === round)
  const avg = rows => rows.reduce((s, r) => s + r.points, 0) / (rows.length || 1)
  const best = rows => rows.reduce((a, b) => (b.points > a.points ? b : a), rows[0])
  const lineOf = (key, rows, field) => ({ key, label: key, color: COLORS[key], points: rows.map(r => ({ x: r.round, y: r[field] })) })
  const roundSeries = [PREVIOUS && lineOf(PREVIOUS, last, 'total'), lineOf(CURRENT, now, 'total')].filter(Boolean)
  const rankSeries = [PREVIOUS && lineOf(PREVIOUS, last, 'overallRank'), lineOf(CURRENT, now, 'overallRank')].filter(Boolean)
  const xs = Array.from({ length: Math.max(...[...now, ...last].map(r => r.round)) }, (_, i) => i + 1)
  const ranked = SEASONS.filter(s => s.rank)
  const bestSeason = ranked.reduce((a, b) => (b.rank < a.rank ? b : a), ranked[0])

  const tiles = [
    [`${CURRENT} after GW${round}`, `${num(now.at(-1).total)} pts`, `#${num(now.at(-1).overallRank)} overall`],
    ...(then ? [[`${PREVIOUS} after GW${round}`, `${num(then.total)} pts`, `#${num(then.overallRank)} overall`]] : []),
    ...(then ? [['Difference', `${now.at(-1).total - then.total >= 0 ? '+' : '−'}${Math.abs(now.at(-1).total - then.total)} pts`, `${now.at(-1).overallRank < then.overallRank ? 'better' : 'worse'} rank than ${PREVIOUS}`]] : []),
    ['Per round', `${avg(now).toFixed(1)} pts`, PREVIOUS ? `${avg(last).toFixed(1)} in ${PREVIOUS} · best GW${best(now).round} (${best(now).points})` : `best GW${best(now).round} (${best(now).points})`],
  ]

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {tiles.map(([label, value, note]) => (
          <div key={label} className="rounded-xl px-3 py-2" style={panelStyle}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-base font-bold text-slate-100 tabular-nums">{value}</p>
            <p className="text-[11px] text-slate-500 truncate" title={note}>{note}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl p-3 mb-3" style={panelStyle}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-slate-100">Total points by round</h3>
          <Legend items={roundSeries} />
        </div>
        <LineChart series={roundSeries} xs={xs} xLabel={v => `GW${v}`} format={v => num(Math.round(v))} />
      </section>

      <section className="rounded-xl p-3 mb-3" style={panelStyle}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-slate-100">Overall rank by round <span className="font-normal text-[11px] text-slate-500">· higher is better</span></h3>
          <Legend items={rankSeries} />
        </div>
        <LineChart series={rankSeries} xs={xs} xLabel={v => `GW${v}`} format={v => `#${num(Math.round(v))}`} log invert ticks={rankTicks(rankSeries.flatMap(s => s.points.map(p => p.y)))} />
      </section>

      <section className="rounded-xl p-3" style={panelStyle}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-slate-100">Every season <span className="font-normal text-[11px] text-slate-500">· final overall rank, higher is better</span></h3>
          <span className="text-[11px] text-slate-500">Best: {bestSeason.season} (#{num(bestSeason.rank)}) · * so far</span>
        </div>
        <LineChart
          series={[{ key: 'final', label: 'Final rank', color: COLORS[CURRENT], points: ranked.map(s => ({ x: Number(s.season), y: s.rank })) }]}
          everyX
          markers
          xs={ranked.map(s => Number(s.season))}
          xLabel={v => (SEASONS.find(s => Number(s.season) === v)?.live ? `${v}*` : String(v))}
          format={v => `#${num(Math.round(v))}`}
          log
          invert
          height={180}
          ticks={rankTicks(ranked.map(s => s.rank))}
        />
        <table className="w-full text-xs tabular-nums mt-3">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-semibold py-1">Season</th>
              <th className="text-right font-semibold py-1">Points</th>
              <th className="text-right font-semibold py-1">Final rank</th>
              <th className="text-right font-semibold py-1"><span className="sm:hidden">Change</span><span className="hidden sm:inline">vs year before</span></th>
            </tr>
          </thead>
          <tbody>
            {[...SEASONS].reverse().map((s, i, list) => {
              const before = list[i + 1]
              const change = before && s.rank && before.rank ? before.rank - s.rank : null
              return (
                <tr key={s.season} className="border-t border-white/5">
                  <td className="py-1.5 text-slate-300">{s.season}{s.live && <span className="text-slate-500"> · so far, GW{round}</span>}</td>
                  <td className="py-1.5 text-right text-slate-100 font-semibold">{num(s.points)}</td>
                  <td className="py-1.5 text-right text-slate-300">#{num(s.rank)}</td>
                  <td className={`py-1.5 text-right ${change == null || s.live ? 'text-slate-600' : change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {change == null || s.live ? '–' : <>{change > 0 ? '▲' : '▼'} {num(Math.abs(change))}<span className="hidden sm:inline"> places</span></>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">
        Past seasons' totals and final ranks come from the game. {PREVIOUS}'s rounds 1–{last.at(-1)?.round} are from your sheet; from {CURRENT} on, every finished round is archived automatically and kept when your team id changes next season.
      </p>
    </div>
  )
}
