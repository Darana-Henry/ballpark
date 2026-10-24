// Fetches every fantasy league's round deadlines and writes them to
// src/data/fantasyDeadlines.json (imported by the Deadlines tab) and
// public/fantasy-deadlines.ics (a calendar to subscribe to by URL).
//
// Premier League, Eliteserien and Allsvenskan fantasy all run on the same
// platform, whose bootstrap feed carries each round's official deadline.
// Bundesliga, Serie A and Champions League fantasy lock five minutes before
// the first kickoff of the matchday, so those are computed from ESPN
// fixtures. None of these sources allow cross-origin reads, so this runs at
// deploy time instead of in the browser.
//
// Usage: node scripts/fetch-fantasy-deadlines.mjs
// A league whose source fails keeps its last good rounds from the existing
// JSON, and the script always exits 0, so an outage never blocks a deploy.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FANTASY_LEAGUES } from '../src/constants/fantasyLeagues.js'

const OUT_JSON = fileURLToPath(new URL('../src/data/fantasyDeadlines.json', import.meta.url))
const OUT_ICS = fileURLToPath(new URL('../public/fantasy-deadlines.ics', import.meta.url))
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36' }

const LOCK_BEFORE_KICKOFF_MS = 5 * 60 * 1000
// Calendar events start this long before the deadline: the hour to set a team.
const PREP_MS = 60 * 60 * 1000

// ─── Official deadlines ─────────────────────────────────────────────────────

const OFFICIAL_FEEDS = {
  premierLeague: 'https://fantasy.premierleague.com/api/bootstrap-static/',
  eliteserien:   'https://fantasy.eliteserien.no/api/bootstrap-static/',
  allsvenskan:   'https://fantasy.allsvenskan.se/api/bootstrap-static/',
}

async function fetchOfficial(url) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { events } = await res.json()
  return events
    .filter(e => e.deadline_time)
    .map(e => ({ round: e.id, label: e.name, deadline: new Date(e.deadline_time).toISOString(), provisional: false }))
}

// ─── Deadlines from fixtures ────────────────────────────────────────────────

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

// A new matchday starts once the gap since the previous fixture exceeds this.
// Domestic matchdays cluster within a Fri–Mon window and European ones within
// Tue–Thu, while the next matchday's opener is usually days later.
const MATCHDAY_GAP_MS = 60 * 60 * 60 * 1000

// Seasons run July–June; season 2026 = 2026-27.
function seasonMonths() {
  const now = new Date()
  const start = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return Array.from({ length: 12 }, (_, i) => {
    const month = (6 + i) % 12
    return `${start + (6 + i >= 12 ? 1 : 0)}${String(month + 1).padStart(2, '0')}`
  })
}

// One request per month: ESPN ignores date ranges (see src/api/espnDates.js).
async function fetchFixtures(slug) {
  const pages = await Promise.all(seasonMonths().map(async month => {
    const res = await fetch(`${ESPN}/${slug}/scoreboard?dates=${month}&limit=300`, { headers: HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${month}`)
    return (await res.json()).events ?? []
  }))
  const seen = new Set()
  return pages.flat()
    .filter(e => e?.id && !seen.has(e.id) && seen.add(e.id))
    .map(e => ({
      kickoff: new Date(e.date),
      // ESPN flags kickoffs that are placeholders until TV picks are announced.
      provisional: e.competitions?.[0]?.timeValid === false,
      stage: e.season?.slug ?? null,
      teams: (e.competitions?.[0]?.competitors ?? []).map(c => c.team?.id),
    }))
    .sort((a, b) => a.kickoff - b.kickoff)
}

// A midweek round can start under 60 hours after a weekend one ends, so a
// team turning up twice also starts a new matchday: each plays once per round.
function groupMatchdays(fixtures) {
  const groups = []
  let teams = new Set()
  for (const f of fixtures) {
    const current = groups[groups.length - 1]
    const sameRound = current
      && f.kickoff - current[current.length - 1].kickoff <= MATCHDAY_GAP_MS
      && !f.teams.some(id => teams.has(id))
    if (sameRound) current.push(f)
    else {
      groups.push([f])
      teams = new Set()
    }
    f.teams.forEach(id => teams.add(id))
  }
  return groups
}

function toRound(group, round, label) {
  const first = group[0]
  return {
    round,
    label,
    deadline: new Date(first.kickoff.getTime() - LOCK_BEFORE_KICKOFF_MS).toISOString(),
    provisional: first.provisional,
  }
}

async function fetchDomestic(slug) {
  return groupMatchdays(await fetchFixtures(slug)).map((group, i) => toRound(group, i + 1, `Matchday ${i + 1}`))
}

const UCL_STAGES = {
  'league-phase':            'Matchday',
  'knockout-round-playoffs': 'Knockout play-offs',
  'round-of-16':             'Round of 16',
  'quarterfinals':           'Quarter-finals',
  'semifinals':              'Semi-finals',
  'final':                   'Final',
}

// League-phase matchdays are numbered; each knockout stage is grouped on its
// own, so its two legs become "1st leg" / "2nd leg". Knockout fixtures only
// appear once each draw is made. Qualifying rounds aren't part of the game.
async function fetchChampionsLeague() {
  const fixtures = (await fetchFixtures('uefa.champions')).filter(f => UCL_STAGES[f.stage])
  const rounds = []
  for (const [stage, name] of Object.entries(UCL_STAGES)) {
    const groups = groupMatchdays(fixtures.filter(f => f.stage === stage))
    groups.forEach((group, i) => {
      const label = stage === 'league-phase' ? `${name} ${i + 1}`
        : groups.length > 1 ? `${name} · ${i === 0 ? '1st' : '2nd'} leg`
        : name
      rounds.push(toRound(group, rounds.length + 1, label))
    })
  }
  return rounds
}

const SOURCES = {
  premierLeague:   () => fetchOfficial(OFFICIAL_FEEDS.premierLeague),
  eliteserien:     () => fetchOfficial(OFFICIAL_FEEDS.eliteserien),
  allsvenskan:     () => fetchOfficial(OFFICIAL_FEEDS.allsvenskan),
  bundesliga:      () => fetchDomestic('ger.1'),
  serieA:          () => fetchDomestic('ita.1'),
  championsLeague: fetchChampionsLeague,
}

// ─── Calendar ───────────────────────────────────────────────────────────────

const icsDate = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsDay = d => d.toISOString().slice(0, 10).replace(/-/g, '')
const icsText = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

// RFC 5545 caps lines at 75 octets; longer ones continue on lines starting
// with a space. Split on characters, not bytes, so emoji stay whole.
function fold(line) {
  const out = []
  let current = ''
  for (const ch of line) {
    if (Buffer.byteLength(current + ch) > (out.length ? 74 : 75)) {
      out.push(current)
      current = ''
    }
    current += ch
  }
  out.push(current)
  return out.join('\r\n ')
}

// Each event runs from an hour before the deadline to the deadline itself, so
// a calendar notification "at start of event" is the one-hour warning. Google
// ignores alarms inside subscribed calendars, which is why the timing lives in
// the event rather than in a VALARM; the VALARM is for clients that honour it.
// UIDs depend only on league, season and round, so a moved deadline updates
// the existing event instead of adding a second one. A provisional deadline
// (kickoff not yet fixed) is an all-day event until the time is confirmed.
function buildCalendar(leagues, generatedAt) {
  const stamp = icsDate(new Date(generatedAt))
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ballpark//Fantasy deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Fantasy deadlines',
    'X-WR-CALDESC:Set-your-team reminders\\, an hour before each fantasy deadline',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]

  for (const league of FANTASY_LEAGUES) {
    for (const r of leagues[league.id]?.rounds ?? []) {
      const deadline = new Date(r.deadline)
      const title = `${league.emoji} ${league.calendarName} ${r.label}: set your team`
      lines.push('BEGIN:VEVENT', `UID:${league.id}-${deadline.getUTCFullYear()}-r${r.round}@ballpark-fantasy`, `DTSTAMP:${stamp}`)
      if (r.provisional) {
        const next = new Date(deadline.getTime() + 24 * 60 * 60 * 1000)
        lines.push(
          `DTSTART;VALUE=DATE:${icsDay(deadline)}`,
          `DTEND;VALUE=DATE:${icsDay(next)}`,
          `SUMMARY:${icsText(`${title} (time TBC)`)}`,
          `DESCRIPTION:${icsText(`${league.name}: kickoff times for this round aren't fixed yet. This becomes a timed reminder once they are.`)}`,
        )
      } else {
        lines.push(
          `DTSTART:${icsDate(new Date(deadline.getTime() - PREP_MS))}`,
          `DTEND:${icsDate(deadline)}`,
          `SUMMARY:${icsText(title)}`,
          `DESCRIPTION:${icsText(`${league.name}: your team locks at the end of this event.`)}`,
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${icsText(title)}`,
          'TRIGGER:PT0M',
          'END:VALARM',
        )
      }
      lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

// ─── Main ───────────────────────────────────────────────────────────────────

let previous = { leagues: {} }
try { previous = JSON.parse(readFileSync(OUT_JSON, 'utf8')) } catch { /* first run */ }

const generatedAt = new Date().toISOString()
const leagues = {}
for (const league of FANTASY_LEAGUES) {
  try {
    const rounds = await SOURCES[league.id]()
    if (!rounds.length) throw new Error('no rounds returned')
    leagues[league.id] = { fetchedAt: generatedAt, rounds }
    console.log(`fantasy deadlines: ${league.id} — ${rounds.length} rounds`)
  } catch (err) {
    leagues[league.id] = previous.leagues?.[league.id] ?? { fetchedAt: null, rounds: [] }
    console.log(`fantasy deadlines: ${league.id} failed (${err.message}); keeping last good data from ${leagues[league.id].fetchedAt ?? 'never'}`)
  }
}

writeFileSync(OUT_JSON, JSON.stringify({ generatedAt, leagues }, null, 2) + '\n')
writeFileSync(OUT_ICS, buildCalendar(leagues, generatedAt))
console.log(`fantasy deadlines: wrote ${OUT_JSON} and ${OUT_ICS}`)
