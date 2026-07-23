import { useState, useEffect, useCallback, useRef, useId } from 'react'

const OVERS = 20
const BALLS = 6
const POWERPLAY = 6

function emptyGrid() {
  return Array.from({ length: OVERS }, () =>
    Array.from({ length: BALLS }, () => ({ home: null, away: null }))
  )
}

function abbr(team) {
  return (team.abbreviation || team.name || '?').slice(0, 4).toUpperCase()
}

const TEAM_COLORS = {
  // BBL
  'Adelaide Strikers':   '#1d79e0',
  'Brisbane Heat':       '#ef4444',
  'Hobart Hurricanes':   '#a855f7',
  'Melbourne Renegades': '#dc2626',
  'Melbourne Stars':     '#10b981',
  'Perth Scorchers':     '#fb923c',
  'Sydney Sixers':       '#ec4899',
  'Sydney Thunder':      '#84cc16',
  // International Test nations
  'India':        '#4d90d3',
  'England':      '#3b82f6',
  'Australia':    '#f5a623',
  'South Africa': '#16a34a',
  'New Zealand':  '#9ca3af',
  'Pakistan':     '#15803d',
  'Bangladesh':   '#0d9488',
  'Sri Lanka':    '#6366f1',
  'West Indies':  '#dc2626',
}

function teamColor(team, fallback) {
  return TEAM_COLORS[team.name] || team.color || fallback
}

function cumulativeBoundaries(grid, over, side) {
  let count = 0
  for (let o = 0; o <= over; o++)
    for (let b = 0; b < BALLS; b++)
      if (grid[o][b][side]) count++
  return count
}

function teamTotals(grid, side) {
  let count = 0
  for (let o = 0; o < OVERS; o++)
    for (let b = 0; b < BALLS; b++)
      if (grid[o][b][side]) count++
  return count
}

function segmentTotals(grid, fromOver, toOver, side) {
  let count = 0
  for (let o = fromOver; o <= toOver; o++)
    for (let b = 0; b < BALLS; b++)
      if (grid[o][b][side]) count++
  return count
}

function BoundaryDot({ color }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded text-[13px] font-bold leading-none select-none"
      style={{
        background: color + '28',
        color,
        border: `1px solid ${color}44`,
        padding: '4px 9px',
      }}
    >
      ◆
    </span>
  )
}

function DiffGraph({ grid, homeAbbr, awayAbbr, homeColor, awayColor, currentOver }) {
  const uid = useId().replace(/:/g, '')

  // Cumulative diff (home - away) after each over
  const diffs = []
  let home = 0, away = 0
  for (let o = 0; o < OVERS; o++) {
    for (let b = 0; b < BALLS; b++) {
      if (grid[o][b].home) home++
      if (grid[o][b].away) away++
    }
    diffs.push(home - away)
  }

  // Only draw up to the last over that has any data
  let lastOver = -1
  outer: for (let o = OVERS - 1; o >= 0; o--)
    for (let b = 0; b < BALLS; b++)
      if (grid[o][b].home || grid[o][b].away) { lastOver = o; break outer }

  const VW = 400, VH = 220
  const padL = 28, padR = 16, padT = 20, padB = 28
  const plotW = VW - padL - padR
  const plotH = VH - padT - padB

  if (lastOver < 0) {
    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%">
        <line x1={padL} y1={padT + plotH / 2} x2={padL + plotW} y2={padT + plotH / 2}
          stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="4 4" />
        <text x={VW / 2} y={VH / 2 + 4} textAnchor="middle"
          fontSize={10} fill="rgba(100,116,139,0.5)" fontFamily="monospace">
          no data yet
        </text>
      </svg>
    )
  }

  const pts     = diffs.slice(0, lastOver + 1)
  const maxAbs  = Math.max(1, ...pts.map(Math.abs))

  const xOf = i => padL + (pts.length > 1 ? (i / (pts.length - 1)) * plotW : plotW / 2)
  const yOf = v  => padT + (1 - (v + maxAbs) / (2 * maxAbs)) * plotH
  const zeroY    = yOf(0)

  // Nice Y-axis ticks
  const step = maxAbs <= 3 ? 1 : maxAbs <= 8 ? 2 : maxAbs <= 15 ? 5 : 10
  const ticks = []
  for (let v = -maxAbs; v <= maxAbs; v += step) ticks.push(v)
  if (!ticks.includes(0)) ticks.push(0)

  // Area polygon: baseline → data points → back to baseline
  const areaPts = [
    `${xOf(0)},${zeroY}`,
    ...pts.map((v, i) => `${xOf(i)},${yOf(v)}`),
    `${xOf(pts.length - 1)},${zeroY}`,
  ].join(' ')

  const linePts = pts.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={`${uid}-above`}>
          <rect x={padL} y={padT} width={plotW} height={Math.max(0, zeroY - padT)} />
        </clipPath>
        <clipPath id={`${uid}-below`}>
          <rect x={padL} y={zeroY} width={plotW} height={Math.max(0, padT + plotH - zeroY)} />
        </clipPath>
      </defs>

      {/* Horizontal grid lines */}
      {ticks.map(v => (
        <line key={v}
          x1={padL} y1={yOf(v)} x2={padL + plotW} y2={yOf(v)}
          stroke={v === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}
          strokeWidth={v === 0 ? 1 : 1}
          strokeDasharray={v === 0 ? undefined : '2 4'}
        />
      ))}

      {/* Y-axis labels */}
      {ticks.map(v => (
        <text key={v} x={padL - 4} y={yOf(v) + 3.5} textAnchor="end"
          fontSize={8} fill={v === 0 ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.5)'}
          fontFamily="monospace">
          {v > 0 ? `+${v}` : v}
        </text>
      ))}

      {/* Filled areas */}
      <polygon points={areaPts} fill={homeColor} opacity={0.18} clipPath={`url(#${uid}-above)`} />
      <polygon points={areaPts} fill={awayColor} opacity={0.18} clipPath={`url(#${uid}-below)`} />

      {/* Line */}
      <polyline points={linePts} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Current-over marker */}
      {currentOver <= lastOver && (() => {
        const cx = xOf(currentOver)
        return (
          <g>
            <line x1={cx} y1={padT} x2={cx} y2={padT + plotH}
              stroke="rgba(255,255,255,0.55)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={cx} y={padT - 4} textAnchor="middle"
              fontSize={8} fill="rgba(255,255,255,0.5)" fontFamily="monospace">
              {currentOver}
            </text>
          </g>
        )
      })()}

      {/* Dots */}
      {pts.map((v, i) => (
        <circle key={i}
          cx={xOf(i)} cy={yOf(v)} r={2.5}
          fill={v > 0 ? homeColor : v < 0 ? awayColor : 'rgba(148,163,184,0.6)'}
          stroke="#0d0d14" strokeWidth={1.5}
        />
      ))}

      {/* X-axis labels */}
      {pts.map((_, i) => {
        if (i % 5 !== 0 && i !== pts.length - 1) return null
        return (
          <text key={i} x={xOf(i)} y={VH - 6} textAnchor="middle"
            fontSize={8} fill="rgba(100,116,139,0.6)" fontFamily="monospace">
            {i}
          </text>
        )
      })}

      {/* Centered watermark labels */}
      {zeroY > padT + 10 && (
        <text
          x={padL + plotW / 2} y={(padT + zeroY) / 2}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={52} fontFamily="Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif"
          fill={homeColor} opacity={0.15} letterSpacing={6}
        >
          {homeAbbr}
        </text>
      )}
      {zeroY < padT + plotH - 10 && (
        <text
          x={padL + plotW / 2} y={(zeroY + padT + plotH) / 2}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={52} fontFamily="Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif"
          fill={awayColor} opacity={0.15} letterSpacing={6}
        >
          {awayAbbr}
        </text>
      )}
    </svg>
  )
}

export default function BoundaryTracker({ game, standings = {}, onClose }) {
  const [grid, setGrid]         = useState(emptyGrid)
  const [focused, setFocused]   = useState({ over: 0, ball: 0 })
  const [awayMode, setAwayMode] = useState(false)
  const historyRef              = useRef([])

  const HOME     = teamColor(game.homeTeam, '#f59e0b')
  const AWAY     = teamColor(game.awayTeam, '#2dd4bf')
  const homeAbbr = abbr(game.homeTeam)
  const awayAbbr = abbr(game.awayTeam)
  const homePos  = standings[game.homeTeam.name]
  const awayPos  = standings[game.awayTeam.name]

  function pushHistory(grid, over, ball) {
    const { home, away } = grid[over][ball]
    historyRef.current.push({ over, ball, prevHome: home, prevAway: away })
    if (historyRef.current.length > 200) historyRef.current.shift()
  }

  const markCell = useCallback((over, ball, side) => {
    setGrid(prev => {
      pushHistory(prev, over, ball)
      const next = prev.map(r => r.map(c => ({ ...c })))
      const cell = next[over][ball]
      cell[side] = cell[side] ? null : true
      return next
    })
  }, [])

  const clearCell = useCallback((over, ball) => {
    setGrid(prev => {
      pushHistory(prev, over, ball)
      const next = prev.map(r => r.map(c => ({ ...c })))
      next[over][ball] = { home: null, away: null }
      return next
    })
  }, [])

  const undoLast = useCallback(() => {
    const last = historyRef.current.pop()
    if (!last) return
    setGrid(prev => {
      const next = prev.map(r => r.map(c => ({ ...c })))
      next[last.over][last.ball] = { home: last.prevHome, away: last.prevAway }
      return next
    })
  }, [])

  const advance = useCallback((over, ball) => {
    let nb = ball + 1, no = over
    if (nb >= BALLS) { nb = 0; no = Math.min(over + 1, OVERS - 1) }
    setFocused({ over: no, ball: nb })
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Q' && e.shiftKey) { onClose(); return }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undoLast(); return }

      const { over, ball } = focused

      if (e.code === 'Space') {
        e.preventDefault()
        const side = awayMode ? 'away' : 'home'
        markCell(over, ball, side)
        return
      }

      if (e.key === 'Backspace' || e.key === 'Delete') { clearCell(over, ball); return }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (e.ctrlKey) setFocused({ over, ball: BALLS - 1 })
        else advance(over, ball)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (e.ctrlKey) {
          setFocused({ over, ball: 0 })
        } else {
          let pb = ball - 1, po = over
          if (pb < 0) { pb = BALLS - 1; po = Math.max(over - 1, 0) }
          setFocused({ over: po, ball: pb })
        }
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocused({ over: e.ctrlKey ? OVERS - 1 : Math.min(over + 1, OVERS - 1), ball }) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused({ over: e.ctrlKey ? 0 : Math.max(over - 1, 0), ball }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, awayMode, markCell, clearCell, advance, undoLast, onClose])

  const homeBoundaries = teamTotals(grid, 'home')
  const awayBoundaries = teamTotals(grid, 'away')

  const COLS = '2.5rem repeat(6, 1fr) 5rem'
  const activeColor = awayMode ? AWAY : HOME
  const activeAbbr  = awayMode ? awayAbbr : homeAbbr

  return (
    <div
      className="fixed inset-0 z-50 flex gap-4 p-4 overflow-auto"
      style={{ background: '#0d0d14' }}
    >
          {/* Left — legend + grid */}
          <div className="flex flex-col gap-2 shrink-0" style={{ width: '620px' }}>

            {/* Controls row */}
            <div className="flex items-center gap-4 px-1">
              <span className="text-[9px] text-slate-600 uppercase tracking-widest font-bold shrink-0">Keys</span>

              {/* Spacebar hint */}
              <span className="flex items-center gap-1 text-[11px]">
                <kbd className="px-1.5 py-px rounded text-[10px] font-mono font-bold text-slate-300"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  Space
                </kbd>
                <span style={{ color: activeColor }}>boundary → {activeAbbr}</span>
              </span>

              {/* Away mode checkbox */}
              <label
                className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]"
                style={{ color: awayMode ? AWAY : '#64748b' }}
              >
                <input
                  type="checkbox"
                  checked={awayMode}
                  onChange={e => setAwayMode(e.target.checked)}
                  className="accent-teal-400 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Away mode ({awayAbbr})</span>
              </label>

              <span className="text-[9px] text-slate-700 ml-auto">⌫ clear · ↑↓←→ move</span>
            </div>

            {/* Grid card */}
            <div className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}>

              {/* Column header */}
              <div
                className="grid text-[9px] font-bold uppercase tracking-widest text-slate-500 border-b border-white/[0.07]"
                style={{
                  gridTemplateColumns: COLS,
                  background: 'rgba(255,255,255,0.04)',
                  padding: '7px 10px',
                }}
              >
                <span className="text-center">Ov</span>
                {Array.from({ length: BALLS }, (_, b) => (
                  <span key={b} className="text-center">{b + 1}</span>
                ))}
                <span className="text-center">Leader</span>
              </div>

              {/* Rows */}
              {grid.map((row, o) => {
                const isPP     = o < POWERPLAY
                const isLastPP = o === POWERPLAY - 1
                const homeCount = cumulativeBoundaries(grid, o, 'home')
                const awayCount = cumulativeBoundaries(grid, o, 'away')

                let frLabel = '—', frColor = '#334155'
                if (homeCount + awayCount > 0) {
                  if (homeCount > awayCount)      { frLabel = homeAbbr; frColor = HOME }
                  else if (awayCount > homeCount) { frLabel = awayAbbr; frColor = AWAY }
                  else                            { frLabel = '=';      frColor = '#64748b' }
                }

                const rowBg = isPP
                  ? o % 2 === 0 ? 'rgba(99,102,241,0.07)' : 'rgba(99,102,241,0.11)'
                  : o % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'

                return (
                  <div
                    key={o}
                    className="grid items-center"
                    style={{
                      gridTemplateColumns: COLS,
                      background: rowBg,
                      padding: '2px 10px',
                      minHeight: '36px',
                      borderBottom: isLastPP
                        ? '1px solid rgba(99,102,241,0.25)'
                        : '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    {/* Over number */}
                    <span
                      className="text-center text-[11px] font-mono tabular-nums font-medium"
                      style={{ color: isPP ? '#818cf8' : '#475569' }}
                    >
                      {o}
                    </span>

                    {/* Ball cells */}
                    {row.map((cell, b) => {
                      const isFocused = focused.over === o && focused.ball === b
                      const hasHome = !!cell.home
                      const hasAway = !!cell.away

                      return (
                        <div
                          key={b}
                          onClick={() => setFocused({ over: o, ball: b })}
                          className="flex items-center justify-center cursor-pointer mx-0.5"
                          style={{
                            height: '28px',
                            borderRadius: '5px',
                            background: isFocused ? 'rgba(255,255,255,0.1)' : 'transparent',
                            border: isFocused
                              ? '1.5px solid rgba(255,255,255,0.3)'
                              : '1px solid transparent',
                            transition: 'background 0.1s, border-color 0.1s',
                          }}
                        >
                          {!hasHome && !hasAway && (
                            <span className="text-[12px] text-slate-400 font-mono tabular-nums select-none">
                              {b === 5 ? `${o + 1}.0` : `${o}.${b + 1}`}
                            </span>
                          )}
                          {hasHome && !hasAway && <BoundaryDot color={HOME} />}
                          {hasAway && !hasHome && <BoundaryDot color={AWAY} />}
                          {hasHome && hasAway && (
                            <div className="flex gap-px">
                              <BoundaryDot color={HOME} />
                              <BoundaryDot color={AWAY} />
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Leader */}
                    <div className="text-center">
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: frColor }}>
                        {frLabel}
                      </span>
                      {frLabel !== '—' && frLabel !== '=' && (
                        <span className="text-[9px] text-slate-700 ml-1 tabular-nums">
                          {Math.max(homeCount, awayCount)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>

          {/* Right — top: graph / bottom: team info */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">

            {/* Top half — graph */}
            <div
              className="flex-1 min-h-0 rounded-2xl p-4 flex flex-col gap-2"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold shrink-0">
                Boundary gap · per over
              </p>
              <div className="flex-1 min-h-0">
                <DiffGraph
                  grid={grid}
                  homeAbbr={homeAbbr}
                  awayAbbr={awayAbbr}
                  homeColor={HOME}
                  awayColor={AWAY}
                  currentOver={focused.over}
                />
              </div>
            </div>

            {/* Bottom half — team info, scales with box height via cqh */}
            <div
              className="flex-1 min-h-0 rounded-2xl p-4 flex flex-col gap-3"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                containerType: 'size',
              }}
            >
              {/* Teams row */}
              <div className="flex items-center justify-between shrink-0" style={{ gap: '2cqh' }}>

                {/* Home */}
                <div className="flex items-center" style={{ gap: '2.5cqh' }}>
                  {game.homeTeam.logo && (
                    <img src={game.homeTeam.logo} alt={homeAbbr}
                      style={{ width: '12cqh', height: '12cqh' }}
                      className="object-contain rounded-full bg-slate-800/50 p-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="font-bold leading-tight" style={{ color: HOME, fontSize: '6cqh' }}>{homeAbbr}{homePos != null ? ` (${homePos})` : ''}</p>
                    <p className="text-slate-500" style={{ fontSize: 'max(9px, 2.2cqh)' }}>{game.homeTeam.name}</p>
                  </div>
                  <div className="flex items-baseline" style={{ gap: '0.8cqh' }}>
                    <span className="font-bold tabular-nums" style={{ color: HOME, fontSize: '20cqh' }}>{homeBoundaries}</span>
                    <span className="text-slate-600" style={{ fontSize: 'max(8px, 2cqh)' }}>bdry</span>
                  </div>
                </div>

                {/* Centre */}
                <span className="text-slate-600 font-bold uppercase tracking-wider shrink-0"
                  style={{ fontSize: 'max(10px, 4cqh)' }}>vs</span>

                {/* Away */}
                <div className="flex items-center flex-row-reverse" style={{ gap: '2.5cqh' }}>
                  {game.awayTeam.logo && (
                    <img src={game.awayTeam.logo} alt={awayAbbr}
                      style={{ width: '12cqh', height: '12cqh' }}
                      className="object-contain rounded-full bg-slate-800/50 p-0.5 shrink-0" />
                  )}
                  <div className="text-right">
                    <p className="font-bold leading-tight" style={{ color: AWAY, fontSize: '6cqh' }}>{awayAbbr}{awayPos != null ? ` (${awayPos})` : ''}</p>
                    <p className="text-slate-500" style={{ fontSize: 'max(9px, 2.2cqh)' }}>{game.awayTeam.name}</p>
                  </div>
                  <div className="flex items-baseline flex-row-reverse" style={{ gap: '0.8cqh' }}>
                    <span className="font-bold tabular-nums" style={{ color: AWAY, fontSize: '20cqh' }}>{awayBoundaries}</span>
                    <span className="text-slate-600" style={{ fontSize: 'max(8px, 2cqh)' }}>bdry</span>
                  </div>
                </div>

              </div>

              {/* Segment breakdown */}
              <div className="flex-1 min-h-0 flex flex-col justify-center gap-2">
                {[
                  { short: 'PP',    from: 0,  to: 5  },
                  { short: 'MID',   from: 6,  to: 14 },
                  { short: 'DEATH', from: 15, to: 19 },
                ].map(({ short, from, to }) => {
                  const h = segmentTotals(grid, from, to, 'home')
                  const a = segmentTotals(grid, from, to, 'away')
                  const total = h + a
                  const homePct = total > 0 ? (h / total) * 100 : 50
                  const awayPct = total > 0 ? (a / total) * 100 : 50
                  const homeWins = h > a
                  const awayWins = a > h
                  return (
                    <div key={short} className="flex items-center gap-2">
                      {/* Phase label */}
                      <span className="text-[9px] font-bold uppercase tracking-widest shrink-0 w-10 text-right"
                        style={{ color: 'rgba(100,116,139,0.7)' }}>
                        {short}
                      </span>
                      {/* Bar with numbers inside */}
                      <div className="flex-1 flex rounded-md overflow-hidden" style={{ height: '28px', background: 'rgba(255,255,255,0.05)' }}>
                        {total > 0 ? (
                          <>
                            <div
                              className="flex items-center justify-center transition-all duration-300"
                              style={{ width: `${homePct}%`, background: HOME, opacity: homeWins ? 0.75 : 0.32 }}
                            >
                              {h > 0 && (
                                <span className="text-[12px] font-bold tabular-nums select-none"
                                  style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                  {h}
                                </span>
                              )}
                            </div>
                            <div
                              className="flex items-center justify-center transition-all duration-300"
                              style={{ width: `${awayPct}%`, background: AWAY, opacity: awayWins ? 0.75 : 0.32 }}
                            >
                              {a > 0 && (
                                <span className="text-[12px] font-bold tabular-nums select-none"
                                  style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                  {a}
                                </span>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Keyboard hints */}
              <p className="text-slate-700 text-center shrink-0" style={{ fontSize: 'max(8px, 1.8cqh)' }}>
                Shift+Q close · Ctrl+Z undo · Space boundary · ⌫ clear · ↑↓←→ move · Ctrl+↑↓←→ jump
              </p>
            </div>

          </div>

    </div>
  )
}
