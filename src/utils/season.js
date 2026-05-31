export function getSeasonYear(league, gameDateStr) {
  if (!gameDateStr) return null
  const d = new Date(gameDateStr)
  const year = d.getFullYear()
  const month = d.getMonth() // 0-indexed
  if (league === 'mlb') return year
  if (league === 'nba') return month >= 9 ? year + 1 : year  // e.g. Oct 2025 → 2026
  if (league === 'nfl') return month >= 8 ? year : year - 1  // e.g. Sep 2025 → 2025
  return year
}

export function getSeasonLabel(league, year) {
  if (league === 'nba') return `${year - 1}-${String(year).slice(2)}`
  if (league === 'nfl') return `${year}-${String(year + 1).slice(2)}`
  return String(year)
}

export function getAvailableSeasons(watchedGames, league) {
  const years = new Set()
  Object.values(watchedGames).forEach(g => {
    if (g.league !== league || !g.watched || !g.gameDate) return
    const yr = getSeasonYear(league, g.gameDate)
    if (yr) years.add(yr)
  })
  return [...years].sort((a, b) => b - a) // newest first
}
