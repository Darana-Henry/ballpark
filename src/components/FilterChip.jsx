// Toggle chip for filter rows: indigo when on.
export default function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
        active ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-400 hover:text-slate-200 border border-transparent',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
