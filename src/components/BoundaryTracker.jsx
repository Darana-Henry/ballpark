import { useState, useEffect, useCallback, useRef } from 'react'

const OVERS = 20
const BALLS = 6
const POWERPLAY = 6   // overs 0–5

function emptyGrid() {
  return Array.from({ length: OVERS }, () =>
    Array.from({ length: BALLS }, () => ({ home: null, away: null }))
  )
}

function abbr(team) {
  return (team.abbreviation || team.name || '?').slice(0, 4).toUpperCase()
}

function cumulativeBoundaryRuns(grid, over, side) {
  let runs = 0
  for (let o = 0; o <= over; o++)
    for (let b = 0; b < BALLS; b++) {
      const v = grid[o][b][side]
      if (v === 4) runs += 4
      else if (v === 6) runs += 6
    }
  return runs
}

function teamTotals(grid, side) {
  let fours = 0, sixes = 0
  for (let o = 0; o < OVERS; o++)
    for (let b = 0; b < BALLS; b++) {
      const v = grid[o][b][side]
      if (v === 4) fours++
      else if (v === 6) sixes++
    }
  return { fours, sixes }
}

function Chip({ value, color }) {
  if (!value) return null
  return (
    <span
      className="inline-flex items-center justify-center rounded text-[16px] font-bold leading-none select-none"
      style={{
        background: color + '28',
        color,
        border: `1px solid ${color}44`,
        padding: '4px 9px',
      }}
    >
      {value}
    </span>
  )
}

export default function BoundaryTracker({ game, onClose }) {
  const [grid, setGrid]       = useState(emptyGrid)
  const [focused, setFocused] = useState({ over: 0, ball: 0 })
  const historyRef            = useRef([])   // action log for undo

  const HOME     = '#f59e0b'
  const AWAY     = '#2dd4bf'
  const homeAbbr = abbr(game.homeTeam)
  const awayAbbr = abbr(game.awayTeam)

  // Push snapshot of a single cell before mutating it
  function pushHistory(grid, over, ball) {
    const { home, away } = grid[over][ball]
    historyRef.current.push({ over, ball, prevHome: home, prevAway: away })
    if (historyRef.current.length > 50) historyRef.current.shift()
  }

  const markCell = useCallback((over, ball, side, value) => {
    setGrid(prev => {
      pushHistory(prev, over, ball)
      const next = prev.map(r => r.map(c => ({ ...c })))
      const cell = next[over][ball]
      cell[side] = cell[side] === value ? null : value
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

      // Ctrl+Z undo
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undoLast(); return }

      const { over, ball } = focused
      if (e.key === '1') { markCell(over, ball, 'home', 4); advance(over, ball); return }
      if (e.key === '2') { markCell(over, ball, 'home', 6); advance(over, ball); return }
      if (e.key === '3') { markCell(over, ball, 'away', 4); advance(over, ball); return }
      if (e.key === '4') { markCell(over, ball, 'away', 6); advance(over, ball); return }

      if (e.key === 'Backspace' || e.key === 'Delete') { clearCell(over, ball); return }

      if (e.key === 'ArrowRight') { e.preventDefault(); advance(over, ball) }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        let pb = ball - 1, po = over
        if (pb < 0) { pb = BALLS - 1; po = Math.max(over - 1, 0) }
        setFocused({ over: po, ball: pb })
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocused({ over: Math.min(over + 1, OVERS - 1), ball }) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused({ over: Math.max(over - 1, 0), ball }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, markCell, clearCell, advance, undoLast, onClose])

  const ht = teamTotals(grid, 'home')
  const at = teamTotals(grid, 'away')

  const COLS = '2.5rem repeat(6, 1fr) 5rem'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-auto"
      style={{ background: '#0d0d14' }}
    >
      <div className="flex flex-col gap-3 p-4 h-full">

        {/* ── Header card (full width) ── */}
        <div
          className="rounded-2xl p-3 flex items-center shrink-0"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Home */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {game.homeTeam.logo && (
              <img src={game.homeTeam.logo} alt={homeAbbr}
                className="w-9 h-9 object-contain rounded-full bg-slate-800/50 p-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight" style={{ color: HOME }}>{homeAbbr}</p>
              <p className="text-[10px] text-slate-500 truncate">{game.homeTeam.name}</p>
            </div>
            <div className="ml-3 flex items-center gap-3 text-xs shrink-0">
              <span>
                <span className="font-bold" style={{ color: HOME }}>{ht.fours}</span>
                <span className="text-slate-600">×4</span>
              </span>
              <span>
                <span className="font-bold" style={{ color: HOME }}>{ht.sixes}</span>
                <span className="text-slate-600">×6</span>
              </span>
              <span className="text-slate-300 font-semibold">
                {ht.fours * 4 + ht.sixes * 6}
                <span className="text-slate-600 font-normal text-[10px] ml-0.5">br</span>
              </span>
            </div>
          </div>

          {/* Centre */}
          <div className="flex flex-col items-center gap-0.5 px-4 shrink-0">
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">vs</span>
            <span className="text-[9px] text-slate-700">Shift+Q · Ctrl+Z undo</span>
          </div>

          {/* Away */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-row-reverse">
            {game.awayTeam.logo && (
              <img src={game.awayTeam.logo} alt={awayAbbr}
                className="w-9 h-9 object-contain rounded-full bg-slate-800/50 p-0.5 shrink-0" />
            )}
            <div className="min-w-0 text-right">
              <p className="text-sm font-bold leading-tight" style={{ color: AWAY }}>{awayAbbr}</p>
              <p className="text-[10px] text-slate-500 truncate">{game.awayTeam.name}</p>
            </div>
            <div className="mr-3 flex items-center gap-3 text-xs shrink-0 flex-row-reverse">
              <span>
                <span className="font-bold" style={{ color: AWAY }}>{at.fours}</span>
                <span className="text-slate-600">×4</span>
              </span>
              <span>
                <span className="font-bold" style={{ color: AWAY }}>{at.sixes}</span>
                <span className="text-slate-600">×6</span>
              </span>
              <span className="text-slate-300 font-semibold">
                {at.fours * 4 + at.sixes * 6}
                <span className="text-slate-600 font-normal text-[10px] ml-0.5">br</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Body: grid left, right panel empty ── */}
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Left — legend + grid */}
          <div className="flex flex-col gap-2 shrink-0" style={{ width: '620px' }}>

            {/* Legend */}
            <div className="flex items-center gap-3 px-1">
              <span className="text-[9px] text-slate-600 uppercase tracking-widest font-bold shrink-0">Keys</span>
              {[
                { key: '1', label: `${homeAbbr} 4`, color: HOME },
                { key: '2', label: `${homeAbbr} 6`, color: HOME },
                { key: '3', label: `${awayAbbr} 4`, color: AWAY },
                { key: '4', label: `${awayAbbr} 6`, color: AWAY },
              ].map(({ key, label, color }) => (
                <span key={key} className="flex items-center gap-1 text-[11px]">
                  <kbd className="px-1.5 py-px rounded text-[10px] font-mono font-bold text-slate-300"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    {key}
                  </kbd>
                  <span style={{ color }}>{label}</span>
                </span>
              ))}
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
                const isPP      = o < POWERPLAY
                const isLastPP  = o === POWERPLAY - 1
                const homeRuns  = cumulativeBoundaryRuns(grid, o, 'home')
                const awayRuns  = cumulativeBoundaryRuns(grid, o, 'away')

                let frLabel = '—', frColor = '#334155'
                if (homeRuns + awayRuns > 0) {
                  if (homeRuns > awayRuns)      { frLabel = homeAbbr; frColor = HOME }
                  else if (awayRuns > homeRuns) { frLabel = awayAbbr; frColor = AWAY }
                  else                          { frLabel = '=';      frColor = '#64748b' }
                }

                const rowBg = isPP
                  ? o % 2 === 0
                    ? 'rgba(99,102,241,0.07)'
                    : 'rgba(99,102,241,0.11)'
                  : o % 2 === 0
                    ? 'transparent'
                    : 'rgba(255,255,255,0.02)'

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
                      const hasHome = cell.home !== null
                      const hasAway = cell.away !== null

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
                            <span className="text-[16px] text-slate-400 font-mono tabular-nums select-none">
                              {o}.{b + 1}
                            </span>
                          )}
                          {hasHome && !hasAway && <Chip value={cell.home} color={HOME} />}
                          {hasAway && !hasHome && <Chip value={cell.away} color={AWAY} />}
                          {hasHome && hasAway && (
                            <div className="flex gap-px">
                              <Chip value={cell.home} color={HOME} />
                              <Chip value={cell.away} color={AWAY} />
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Front runner */}
                    <div className="text-center">
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: frColor }}>
                        {frLabel}
                      </span>
                      {frLabel !== '—' && frLabel !== '=' && (
                        <span className="text-[9px] text-slate-700 ml-1 tabular-nums">
                          {Math.max(homeRuns, awayRuns)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>

          {/* Right — reserved for future content */}
          <div
            className="flex-1 min-w-0 rounded-2xl"
            style={{
              border: '1px dashed rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.01)',
            }}
          />

        </div>
      </div>
    </div>
  )
}
