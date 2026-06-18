import { useState, useEffect } from 'react'

function formatCountdown(ms) {
  if (ms <= 0) return null
  const totalSec = Math.floor(ms / 1000)
  const days  = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins  = Math.floor((totalSec % 3600) / 60)
  const secs  = totalSec % 60

  if (days > 0)  return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function useCountdown(targetDate) {
  const [display, setDisplay] = useState(() =>
    targetDate ? formatCountdown(targetDate - Date.now()) : null
  )

  useEffect(() => {
    if (!targetDate) { setDisplay(null); return }
    function tick() {
      const ms = targetDate - Date.now()
      setDisplay(ms > 0 ? formatCountdown(ms) : null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return display
}
