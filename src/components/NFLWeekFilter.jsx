import { useRef, useState, useEffect } from 'react'

// Week picker for the NFL queue: a dropdown listing every week and playoff
// round, with arrows to step one week at a time. Chosen over a pill row because
// 18 weeks plus five playoff rounds don't fit on a phone without scrolling.
export default function NFLWeekFilter({ options, value, onChange, count }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const index = options.findIndex(o => o.id === value)
  const current = options[index] ?? options[0]
  const step = delta => {
    const next = options[index + delta]
    if (next) onChange(next.id)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={() => step(-1)}
          disabled={index <= 0}
          aria-label="Previous week"
          className="px-2.5 py-2 text-slate-400 hover:text-slate-100 disabled:text-slate-700 disabled:hover:text-slate-700 transition-colors"
        >
          ‹
        </button>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="px-3 py-2 text-sm font-medium text-slate-100 min-w-[7.5rem] flex items-center justify-between gap-2"
          >
            {current?.label ?? 'All weeks'}
            <span className="text-slate-500 text-[10px]">▾</span>
          </button>

          {open && (
            <ul
              role="listbox"
              className="absolute z-30 mt-1 left-0 max-h-72 overflow-y-auto rounded-xl py-1 min-w-full shadow-xl"
              style={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {options.map(o => (
                <li key={o.id}>
                  <button
                    role="option"
                    aria-selected={o.id === value}
                    onClick={() => { onChange(o.id); setOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                      o.id === value ? 'text-slate-100 bg-white/10' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={() => step(1)}
          disabled={index < 0 || index >= options.length - 1}
          aria-label="Next week"
          className="px-2.5 py-2 text-slate-400 hover:text-slate-100 disabled:text-slate-700 disabled:hover:text-slate-700 transition-colors"
        >
          ›
        </button>
      </div>

      {value !== 'all' && (
        <button onClick={() => onChange('all')} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Clear
        </button>
      )}
      {count != null && (
        <span className="text-xs text-slate-600">{count} game{count === 1 ? '' : 's'}</span>
      )}
    </div>
  )
}
