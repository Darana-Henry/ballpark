// When a league's next season starts, for the off-season countdown.
//
// Each source publishes next season at a different point:
// - MLB's Stats API has next season's calendar right after the World Series,
//   so its opener (league-wide and the Dodgers') is exact.
// - The BBL's Wikipedia season page gives the first match date (`fromdate` in
//   its infobox) months ahead; no time, so it's a date only.
// - ESPN lists nothing until the schedule is released (NFL in May, NBA in
//   August, …). Its scoreboard is searched over the window the season usually
//   opens in; until games appear there, the countdown runs to an estimate and
//   says so.
//
// Every result: { date, dateOnly, estimated, label, teamFirst? } or null.

import { fetchWikitexts } from './wikiCricket'
import { fetchScoreboardMonths } from './espnDates'

const MLB = 'https://statsapi.mlb.com/api/v1'
const DODGERS_ID = 119

async function getJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

async function mlbOpener(now) {
  // After the season (October on) the next one is next year's.
  const season = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()
  const info = await getJSON(`${MLB}/seasons/${season}?sportId=1`)
  const start = info.seasons?.[0]?.regularSeasonStartDate
  if (!start) return null
  const [league, dodgers] = await Promise.all([
    getJSON(`${MLB}/schedule?sportId=1&gameType=R&startDate=${start}&endDate=${start}`),
    getJSON(`${MLB}/schedule?sportId=1&gameType=R&season=${season}&teamId=${DODGERS_ID}`).catch(() => null),
  ])
  const first = league.dates?.[0]?.games?.[0]
  const firstDodgers = dodgers?.dates?.[0]?.games?.[0]
  const tbd = g => g?.status?.startTimeTBD
  const date = first ? new Date(first.gameDate) : new Date(`${start}T12:00:00`)
  const result = { date, dateOnly: !first || tbd(first), estimated: false, label: `Opening Day ${season}` }
  if (firstDodgers) {
    const home = firstDodgers.teams.home.team.id === DODGERS_ID
    const opp = (home ? firstDodgers.teams.away : firstDodgers.teams.home).team.name
    result.teamFirst = {
      date: new Date(firstDodgers.gameDate),
      dateOnly: tbd(firstDodgers),
      label: `Dodgers ${home ? 'vs' : '@'} ${opp}`,
    }
  }
  return result
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

async function bblOpener(now) {
  // BBL|N runs December → January and is named "YYYY–YY". Once January's final
  // is done, the next one starts this December.
  const y = now.getFullYear()
  const title = `${y}–${String((y + 1) % 100).padStart(2, '0')} Big Bash League season`
  const page = (await fetchWikitexts([title])).get(title)
  const m = page?.text.match(/\|\s*fromdate\s*=\s*(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})/)
  if (!m) return null
  const month = MONTHS.indexOf(m[2])
  if (month < 0) return null
  return {
    date: new Date(Number(m[3]), month, Number(m[1])),
    dateOnly: true,
    estimated: false,
    label: `BBL|${y - 2010}`,
  }
}

// When each ESPN league's season usually opens: the scoreboard window that's
// searched, and the estimate used until the schedule is out.
const ESPN_WINDOWS = {
  nfl: { path: 'football/nfl', label: 'Kickoff', window: y => [`${y}0901`, `${y}0915`], estimate: y => thursdayAfterLaborDay(y), year: now => now.getFullYear() },
  nba: { path: 'basketball/nba', label: 'Opening night', window: y => [`${y}1015`, `${y}1031`], estimate: y => new Date(y, 9, 21), year: now => now.getFullYear() },
  epl: { path: 'soccer/eng.1', label: 'Premier League opener', window: y => [`${y}0801`, `${y}0831`], estimate: y => new Date(y, 7, 15), year: now => now.getFullYear() },
  mls: { path: 'soccer/usa.1', label: 'MLS opener', window: y => [`${y}0215`, `${y}0315`], estimate: y => new Date(y, 1, 22), year: now => (now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()) },
}

function thursdayAfterLaborDay(y) {
  const d = new Date(y, 8, 1)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1) // first Monday of September
  d.setDate(d.getDate() + 3)
  return d
}

async function espnOpener(league, now) {
  const cfg = ESPN_WINDOWS[league]
  const y = cfg.year(now)
  const [from, to] = cfg.window(y)
  // Only regular-season games: preseason (NFL, NBA) and friendlies don't count.
  const events = await fetchScoreboardMonths(cfg.path, from, to).catch(() => [])
  const firstEvent = events
    .filter(e => (e.season?.type ?? 2) === 2 || league === 'epl' || league === 'mls')
    .map(e => new Date(e.date))
    .filter(d => d >= now && d >= new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}`))
    .sort((a, b) => a - b)[0]
  if (firstEvent) return { date: firstEvent, dateOnly: false, estimated: false, label: cfg.label }
  const estimate = cfg.estimate(y)
  if (estimate < now) return null
  return { date: estimate, dateOnly: true, estimated: true, label: cfg.label }
}

const cache = new Map()

export function fetchNextOpener(league, now = new Date()) {
  const key = `${league}:${ymd(now)}`
  if (!cache.has(key)) {
    const run = league === 'mlb' ? mlbOpener(now)
      : league === 'bbl' ? bblOpener(now)
      : ESPN_WINDOWS[league] ? espnOpener(league, now)
      : Promise.resolve(null)
    cache.set(key, run.catch(() => null))
  }
  return cache.get(key)
}

export const COUNTDOWN_LEAGUES = ['mlb', 'nba', 'nfl', 'epl', 'mls', 'bbl']
