export function getSeasonYear(league, gameDateStr) {
  if (!gameDateStr) return null
  const d = new Date(gameDateStr)
  const year = d.getFullYear()
  const month = d.getMonth() // 0-indexed
  if (league === 'mlb') return year
  if (league === 'nba') return month >= 9 ? year + 1 : year  // e.g. Oct 2025 → 2026
  if (league === 'nfl') return month >= 8 ? year : year - 1  // e.g. Sep 2025 → 2025
  // English and European seasons run Aug–May and are labelled by their start
  // year, matching the season boundary in src/api/epl.js.
  if (league === 'epl') return month >= 7 ? year : year - 1
  // The BBL runs Dec–Jan and is labelled by its end year.
  if (league === 'bbl') return month >= 9 ? year + 1 : year
  // MLS runs Feb–Nov inside one calendar year, as does MLB.
  return year
}

// The season a league is currently in, by the same boundaries as above.
export function getCurrentSeasonYear(league, now = new Date()) {
  return getSeasonYear(league, now)
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
