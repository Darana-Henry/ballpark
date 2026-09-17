import { fetchScoreboardMonths } from './espnDates'

// A new matchday starts once the gap since the previous fixture exceeds this
// — real matchdays cluster within a Fri-Mon window (hours apart), while the
// next matchday's opener is days later.
const MATCHDAY_GAP_MS = 60 * 60 * 60 * 1000 // 60 hours

// European domestic seasons run Jul(transfer window)-Jun; season 2026 = Jul
// 2026 - Jun 2027. Mirrors the season-boundary logic in src/api/epl.js.
function getSeason() {
  const now = new Date()
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

async function fetchSeasonEvents(slug) {
  const season = getSeason()
  try {
    const events = await fetchScoreboardMonths(`soccer/${slug}`, `${season}0701`, `${season + 1}0630`)
    return events
      .map(e => new Date(e.date))
      .sort((a, b) => a - b)
  } catch {
    return []
  }
}

function groupIntoMatchdays(dates) {
  const matchdays = []
  let current = []
  for (const date of dates) {
    const prev = current[current.length - 1]
    if (prev && date - prev > MATCHDAY_GAP_MS) {
      matchdays.push(current)
      current = []
    }
    current.push(date)
  }
  if (current.length > 0) matchdays.push(current)
  return matchdays
}

function toDeadlines(matchdays) {
  return matchdays.map((dates, i) => ({
    round: i + 1,
    label: `Matchday ${i + 1}`,
    deadline: dates[0],
  }))
}

export async function fetchBundesligaDeadlines() {
  return toDeadlines(groupIntoMatchdays(await fetchSeasonEvents('ger.1')))
}

export async function fetchSerieADeadlines() {
  return toDeadlines(groupIntoMatchdays(await fetchSeasonEvents('ita.1')))
}
