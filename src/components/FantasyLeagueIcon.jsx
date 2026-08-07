import { useState } from 'react'

export default function FantasyLeagueIcon({ league, size = 36 }) {
  const [err, setErr] = useState(false)
  if (!league.logoUrl || err) {
    return (
      <div
        className={`rounded-full flex items-center justify-center text-sm shrink-0 ${league.iconBg}`}
        style={{ width: size, height: size }}
      >
        {league.emoji}
      </div>
    )
  }
  return (
    <img
      src={league.logoUrl}
      alt={league.name}
      width={size}
      height={size}
      className={`block rounded-full object-contain p-1 shrink-0 ${league.iconBg}`}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  )
}
