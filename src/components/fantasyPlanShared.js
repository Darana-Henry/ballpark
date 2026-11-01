import { useFantasyData } from '../contexts/fantasyData'
import { derivePlan } from '../utils/fantasyPlan'

// Constants and a hook the planning panels share (kept out of the component
// files so fast refresh keeps working).

export const panelStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
export const fmt = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1)
export const NEW_BADGE = { text: 'new', className: 'bg-emerald-500 text-white', title: 'Not in your squad: bring in' }

/** A player's fixtures for `count` rounds from round index `from` (the transfer horizon by default). */
export function useGames() {
  const { plan, HORIZON } = derivePlan(useFantasyData().data)
  return (p, from = 0, count = HORIZON) => plan.byPlayer.get(p.id).games.slice(from, from + count)
}

// A side panel opens below the pitch on phones; bring it into view there.
// On wide screens it sits beside the pitch already.
export function scrollIntoViewOnPhone(element) {
  if (element && !window.matchMedia('(min-width: 1024px)').matches) element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
