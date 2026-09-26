import { FORM_STYLES, lastN } from '../utils/teamForm'

// Last-N results as coloured letters. Built only from watched games, so an
// empty or short strip means "not much marked yet", never "no games played".
export default function RecentForm({ form, max = 5, align = 'left', className = '' }) {
  const recent = lastN(form, max)
  if (!recent.length) return null

  return (
    <span
      className={`inline-flex gap-0.5 ${align === 'right' ? 'justify-end' : ''} ${className}`}
      title={recent.map(r => `${r.result} vs ${r.opponent}`).join('  ·  ')}
    >
      {recent.map((r, i) => {
        const style = FORM_STYLES[r.result] ?? FORM_STYLES.D
        return (
          <span
            key={`${r.gameDate}-${i}`}
            className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold border ${style.className}`}
          >
            {style.label}
          </span>
        )
      })}
    </span>
  )
}
