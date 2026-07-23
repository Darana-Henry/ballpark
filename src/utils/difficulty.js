// Shared difficulty rating used across every league: a 0-1 "opponent
// strength" score (typically the opponent's win pct, or an equivalent) maps
// to a label + Tailwind classes, with an optional bump for playoff/knockout
// stakes.
export function getDifficultyRating(score, isPlayoff = false) {
  const s = score + (isPlayoff ? 0.08 : 0)
  if (s >= 0.580) return { label: 'Extreme',    cls: 'text-red-400    bg-red-500/10    border-red-500/30' }
  if (s >= 0.530) return { label: 'Demanding',  cls: 'text-orange-400 bg-orange-500/10 border-orange-500/30' }
  if (s >= 0.460) return { label: 'Competitive',cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' }
  if (s >= 0.390) return { label: 'Beatable',   cls: 'text-lime-400   bg-lime-500/10   border-lime-500/30' }
  return                 { label: 'Accessible', cls: 'text-green-400  bg-green-500/10  border-green-500/30' }
}
