import {
  INTL_NATIONS, NATION_COLORS, ASSOCIATE_NAMES, computeDifficulty, resolveWinner, formatInnings,
  teamCode,
} from '../utils/cricketMatch.js'

// ─── Wikipedia as the international cricket schedule/results source ───────────
//
// Wikipedia's "International cricket in <season>" pages list every men's
// international tour with one table row per match: match number, date, venue
// and result. Each tour's own article then carries a scorecard template per
// match with the actual scores. Both are read through the MediaWiki API, which
// allows cross-origin requests and needs no key — so unlike CricAPI there's no
// daily quota to ration.
//
// Season pages chain to each other through {{International cricket years|prev|next}},
// so the reader starts at the calendar-year page and walks outward to every
// season page that overlaps the requested year (e.g. 2025–26, 2026, 2026–27).
//
// Output games use the same normalized shape as src/api/intlCricket.js, keyed
// by the Cricinfo match id that every season-table row links to.

const WIKI_API = 'https://en.wikipedia.org/w/api.php'
const SEASON_PREFIX = 'International cricket in '

// {{cr|XXX}} flag-template codes for the 12 tracked nations. Any other code is
// still a real team (an associate), just one this tab doesn't track.
const CODE_TO_NATION = {
  ENG: 'England',      SA:  'South Africa', RSA: 'South Africa', AUS: 'Australia',
  NZ:  'New Zealand',  IND: 'India',        PAK: 'Pakistan',     WIN: 'West Indies',
  WI:  'West Indies',  SL:  'Sri Lanka',    SRI: 'Sri Lanka',    BAN: 'Bangladesh',
  ZIM: 'Zimbabwe',     AFG: 'Afghanistan',  IRE: 'Ireland',
}

// Same flag files the {{cr}} templates render, served from Wikimedia Commons.
const FLAG_FILES = {
  'England':      'Flag of England.svg',
  'South Africa': 'Flag of South Africa.svg',
  'Australia':    'Flag of Australia (converted).svg',
  'New Zealand':  'Flag of New Zealand.svg',
  'India':        'Flag of India.svg',
  'Pakistan':     'Flag of Pakistan.svg',
  'West Indies':  'WestIndiesCricketFlagPre1999.svg',
  'Sri Lanka':    'Flag of Sri Lanka.svg',
  'Bangladesh':   'Flag of Bangladesh.svg',
  'Zimbabwe':     'Flag of Zimbabwe.svg',
  'Afghanistan':  'Flag of Afghanistan (2013–2021).svg',
  'Ireland':      'Cricket Ireland flag.svg',
  // Non-Test sides that play the tracked nations in bilateral tours and
  // tournaments (names as ASSOCIATE_NAMES spells them).
  'Namibia':          'Flag of Namibia.svg',
  'Scotland':         'Flag of Scotland.svg',
  'Netherlands':      'Flag of the Netherlands.svg',
  'Nepal':            'Flag of Nepal.svg',
  'UAE':              'Flag of the United Arab Emirates.svg',
  'Oman':             'Flag of Oman.svg',
  'United States':    'Flag of the United States.svg',
  'Canada':           'Flag of Canada.svg',
  'Hong Kong':        'Flag of Hong Kong.svg',
  'Japan':            'Flag of Japan.svg',
  'Malaysia':         'Flag of Malaysia.svg',
  'Papua New Guinea': 'Flag of Papua New Guinea.svg',
  'Kenya':            'Flag of Kenya.svg',
  'Uganda':           'Flag of Uganda.svg',
  'Italy':            'Flag of Italy.svg',
  'Kuwait':           'Flag of Kuwait.svg',
  'Bahrain':          'Flag of Bahrain.svg',
  'Qatar':            'Flag of Qatar.svg',
  'Singapore':        'Flag of Singapore.svg',
  'Thailand':         'Flag of Thailand.svg',
  'Jersey':           'Flag of Jersey.svg',
  'Tanzania':         'Flag of Tanzania.svg',
  'Nigeria':          'Flag of Nigeria.svg',
  'Bermuda':          'Flag of Bermuda.svg',
}

// Section headings spell some non-Test sides differently from the flag
// templates used in tournament tables; align them so a side has one name.
const HEADING_ALIASES = {
  'United Arab Emirates': 'UAE',
  'USA': 'United States',
  'Hong Kong, China': 'Hong Kong',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_INDEX = Object.fromEntries(MONTHS.map((m, i) => [m.toLowerCase(), i]))

const FORMAT_WORD = { test: 'Test', odi: 'ODI', t20i: 'T20I' }
const DAY_MS = 86400000

// ─── MediaWiki API ─────────────────────────────────────────────────────────────

// Wikimedia asks API clients to identify themselves. Browsers send their own
// User-Agent and use Api-User-Agent for this; under Node (dry-run scripts)
// the default "node" User-Agent gets throttled with HTTP 429 almost at once,
// so a descriptive one is sent there too. It's only set outside the browser —
// there it would be ignored at best and break the cross-origin check at worst.
const CLIENT_ID = 'Ballpark/1.0 (personal sports tracker)'
const WIKI_HEADERS = typeof window === 'undefined'
  ? { 'Api-User-Agent': CLIENT_ID, 'User-Agent': CLIENT_ID }
  : { 'Api-User-Agent': CLIENT_ID }

async function wikiApi(params, retried = false) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })
  const res = await fetch(`${WIKI_API}?${qs}`, { headers: WIKI_HEADERS })
  // Rate limited — wait as asked (capped) and try once more.
  if (res.status === 429 && !retried) {
    const wait = Math.min(parseInt(res.headers.get('retry-after')) || 5, 30)
    await new Promise(r => setTimeout(r, wait * 1000))
    return wikiApi(params, true)
  }
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`)
  return res.json()
}

// Fetches the wikitext of up to 50 pages per request, following redirects.
// Returns a Map keyed by the title as requested; missing pages are omitted.
export async function fetchWikitexts(titles) {
  const out = new Map()
  const unique = [...new Set(titles)]
  for (let i = 0; i < unique.length; i += 50) {
    const json = await wikiApi({
      action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
      redirects: '1', titles: unique.slice(i, i + 50).join('|'),
    })
    const q = json.query || {}
    const requestedAs = new Map()
    for (const n of q.normalized || []) requestedAs.set(n.to, n.from)
    for (const r of q.redirects || []) requestedAs.set(r.to, requestedAs.get(r.from) ?? r.from)
    for (const page of q.pages || []) {
      if (page.missing || !page.revisions?.length) continue
      out.set(requestedAs.get(page.title) ?? page.title, {
        title: page.title,
        text: page.revisions[0].slots.main.content,
      })
    }
  }
  return out
}

// ─── Wikitext cleanup ──────────────────────────────────────────────────────────

const FLAG_TEMPLATE = /\{\{\s*(?:cr|cr-rt|cricon|cricon-rt)\s*\|\s*([A-Za-z]+)[^{}]*\}\}/i

function stripRefs(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
}

// Reduces a wikitext fragment to plain display text: flag templates become the
// nation name, links become their label, footnotes and markup are dropped.
function cleanText(s) {
  if (!s) return ''
  return stripRefs(s)
    .replace(new RegExp(FLAG_TEMPLATE.source, 'gi'), (_, code) => CODE_TO_NATION[code.toUpperCase()] || code.toUpperCase())
    .replace(/\{\{\s*nowrap\s*\|([^{}]*)\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\S+ ([^\]]*)\]/g, '$1')
    .replace(/\[https?:\S+\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cricinfoIdFromUrl(url) {
  if (!url) return null
  const m = url.match(/\/match\/(\d+)/) || url.match(/-(\d{6,8})(?:\/|\.html|$)/)
  return m ? m[1] : null
}

// ─── Teams ─────────────────────────────────────────────────────────────────────

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

// Maps a nation name from a section heading to one of the 12 tracked nations.
// Headings are hand-typed and occasionally misspelled ("Zimbabawe against
// Afghanistan"), so a one-letter slip is tolerated — but only when the first
// three letters agree, so a real associate like Iceland never becomes Ireland.
function matchNation(raw) {
  const name = raw.replace(/^the\s+/i, '').trim().toLowerCase()
  for (const nation of INTL_NATIONS) {
    if (nation.toLowerCase() === name) return nation
  }
  for (const nation of INTL_NATIONS) {
    const n = nation.toLowerCase()
    if (n.slice(0, 3) === name.slice(0, 3) && editDistance(n, name) <= 1) return nation
  }
  return null
}

// A team from a tournament table cell: a {{cr|XXX}} flag template for a real
// side, or plain text ("TBD", "A2", "Winner SF1") for a knockout slot that
// hasn't been decided yet.
function parseTeamCell(cell) {
  const m = cell.match(FLAG_TEMPLATE)
  if (m) {
    const code = m[1].toUpperCase()
    return { name: CODE_TO_NATION[code] || ASSOCIATE_NAMES[code] || code, placeholder: false }
  }
  return { name: cleanText(cell) || 'TBD', placeholder: true }
}

function buildTeam({ name, placeholder }) {
  const tracked = INTL_NATIONS.has(name)
  const flag = FLAG_FILES[name]
  return {
    id:           name,
    name,
    abbreviation: placeholder ? name : teamCode(name),
    logo:         flag ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(flag)}?width=96` : null,
    color:        tracked ? NATION_COLORS[name] : null,
  }
}

// One side of a tour heading: a tracked nation (typo-tolerant), or any other
// team named plainly — no digits, at most three words — so a heading like
// "2026 Asia Cup in Sri Lanka" can't pass for a tour.
function headingSide(raw) {
  const tracked = matchNation(raw)
  if (tracked) return { name: tracked, tracked: true }
  const name = raw.replace(/^the\s+/i, '').trim()
  if (/\d/.test(name) || name.split(' ').length > 3) return null
  return { name: HEADING_ALIASES[name] || name, tracked: false }
}

// A bilateral tour needs at least one of the tracked nations — South Africa
// in Namibia counts, Namibia in Scotland doesn't.
//   "Australia in Zimbabwe"             → Zimbabwe host Australia
//   "Sri Lanka in the West Indies"      → West Indies host Sri Lanka
//   "India against Afghanistan in India" → Afghanistan's home series, played in India
//   "South Africa in Namibia"           → Namibia host South Africa
function parseTourHeading(heading) {
  const h = heading.replace(/\s+/g, ' ').trim()
  const m = h.match(/^(.+?) against (.+?) in (?:the )?(.+)$/i) || h.match(/^(.+?) in (?:the )?(.+)$/i)
  if (!m) return null
  const hostedIn = m.length === 4 && /against/i.test(h) ? m[3] : null
  const away = headingSide(m[1]), home = headingSide(m[2])
  if (!away || !home || !(away.tracked || home.tracked)) return null
  return { home: home.name, away: away.name, hostedIn }
}

// ─── Dates ─────────────────────────────────────────────────────────────────────

// "2025–26" → [2025, 2026]; "2026" → [2026, 2026]
function seasonYears(label) {
  const m = label.match(/^(\d{4})(?:\s*[–-]\s*(\d{2,4}))?$/)
  if (!m) return null
  const start = parseInt(m[1])
  if (!m[2]) return [start, start]
  const end = m[2].length === 2 ? Math.floor(start / 100) * 100 + parseInt(m[2]) : parseInt(m[2])
  return [start, end]
}

// Split seasons (2025–26) run through the southern summer: July–December
// belong to the first year, January–June to the second.
function yearForMonth(month, [startYear, endYear]) {
  if (startYear === endYear) return startYear
  return month >= 6 ? startYear : endYear
}

// Noon UTC keeps the calendar day stable in every timezone the app is viewed from.
function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m, d, 12))
}

// Parses "22 September", "8–12 May" and "28 June–2 July" into start/end dates.
function parseDateCell(cell, years) {
  const text = cleanText(cell)
  const parts = text.split(/\s*[–-]\s*/)
  const read = s => {
    const m = (s || '').match(/(\d{1,2})(?:\s+([A-Za-z]+))?/)
    if (!m) return null
    const month = m[2] ? MONTH_INDEX[m[2].toLowerCase()] : undefined
    return { day: parseInt(m[1]), month }
  }
  const first = read(parts[0])
  const last = read(parts[parts.length - 1]) || first
  if (!first) return null
  const startMonth = first.month ?? last.month
  const endMonth = last.month ?? startMonth
  if (startMonth === undefined) return null
  const startYear = yearForMonth(startMonth, years)
  const endYear = endMonth < startMonth ? startYear + 1 : startYear
  return {
    start: utcDate(startYear, startMonth, first.day),
    end:   utcDate(endYear, endMonth, last.day),
  }
}

function shortDate(d) {
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`
}

function formatDateRange(start, end) {
  if (start.getUTCMonth() === end.getUTCMonth()) return `${shortDate(start)}–${end.getUTCDate()}`
  return `${shortDate(start)}–${shortDate(end)}`
}

function yearSpanLabel(dates) {
  const years = dates.map(d => d.getUTCFullYear())
  const lo = Math.min(...years), hi = Math.max(...years)
  return lo === hi ? `${lo}` : `${lo}–${String(hi).slice(-2)}`
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── Season page parsing ───────────────────────────────────────────────────────

// Splits a page into its ==/===/==== sections, remembering each section's
// month (the enclosing == heading) and its === parent for ==== subsections.
function splitSections(text) {
  const re = /^(={2,4})\s*(.+?)\s*\1\s*$/gm
  const heads = []
  let m
  while ((m = re.exec(text))) heads.push({ level: m[1].length, heading: cleanText(m[2]), index: m.index, bodyStart: re.lastIndex })
  const sections = []
  let month = null, parent = null
  heads.forEach((h, i) => {
    const body = text.slice(h.bodyStart, heads[i + 1]?.index ?? text.length)
    if (h.level === 2) { month = h.heading; parent = null; return }
    if (h.level === 3) parent = h.heading
    sections.push({ ...h, month, parent: h.level === 4 ? parent : null, body })
  })
  return sections
}

const MONTH_HEADING = new RegExp(`^(${MONTHS.join('|')})\\b`, 'i')

// Parses every men's international match row out of one season page.
export function parseSeasonPage(text, seasonLabel) {
  const years = seasonYears(seasonLabel)
  if (!years) return []
  const games = []

  for (const section of splitSections(text)) {
    // Only the per-month tour sections — the overview tables at the top of
    // the page summarise the same tours without per-match rows.
    if (!MONTH_HEADING.test(section.month || '')) continue
    const fullHeading = section.parent ? `${section.parent} – ${section.heading}` : section.heading
    if (/women/i.test(fullHeading)) continue

    const article = section.body.match(/\{\{\s*main\s*\|([^|}]+)/i)?.[1].trim() || null
    const tour = parseTourHeading(section.heading)
    const rows = []
    let stage = null

    for (const line of section.body.split('\n')) {
      if (line.startsWith('!')) {
        const header = line.match(/^!\s*colspan\s*=\s*"?\d+"?\s*\|(.*)$/i)
        if (header) stage = cleanText(header[1])
        continue
      }
      if (!line.startsWith('|') || /^\|\s*[-+}]/.test(line)) continue

      const cells = line.slice(1).split('||').map(c => c.trim())
      if (cells.length < 4) continue

      const link = cells[0].match(/\[(\S+)\s+([^\]]+)\]/)
      const label = cleanText(link ? link[2] : cells[0])
      const fmt = label.match(/\b(Test|ODI|T20I)\b/)
      if (!fmt) continue // women's (WODI/WT20I) and non-international rows
      const matchType = fmt[1].toLowerCase()

      const dates = parseDateCell(cells[1], years)
      if (!dates) continue

      const hasTeamColumns = cells.length >= 6
      let home, away, venueCell, resultCell
      if (hasTeamColumns) {
        home = parseTeamCell(cells[2])
        away = parseTeamCell(cells[3])
        venueCell = cells[4]
        resultCell = cells[5]
      } else {
        if (!tour) continue
        home = { name: tour.home, placeholder: false }
        away = { name: tour.away, placeholder: false }
        venueCell = cells[2]
        resultCell = cells[3]
      }

      rows.push({
        cricinfoId: cricinfoIdFromUrl(link?.[1]),
        label, matchType, dates, home, away, stage, hasTeamColumns,
        venue: cleanText(venueCell) || null,
        result: cleanText(resultCell),
      })
    }
    if (!rows.length) continue

    const isTournament = !tour || rows.some(r => r.hasTeamColumns)
    // Tri-series are named as such, or have exactly three real sides (counted
    // before the 12-nation filter, so an associate host like Namibia counts).
    const sides = new Set(rows.flatMap(r => [r.home, r.away]).filter(t => !t.placeholder).map(t => t.name))
    const seriesKind = !isTournament
      ? 'bilateral'
      : /tri-?(?:nation|series)|triangular/i.test(fullHeading) || sides.size === 3 ? 'tri-series' : 'tournament'
    // Tri-series and tournaments are kept whole — every game counts towards
    // their progress, including ones between associates (Namibia v Zimbabwe)
    // and undecided knockout slots — but only if one of the tracked nations
    // takes part. Associate-only events (e.g. League 2 tri-series) are skipped.
    if (isTournament && ![...sides].some(name => INTL_NATIONS.has(name))) continue
    const span = yearSpanLabel(rows.map(r => r.dates.start))
    const seriesLabel = !isTournament
      ? (tour.hostedIn
          ? `${tour.home} v ${tour.away} (in ${tour.hostedIn}), ${span}`
          : `${tour.away} tour of ${tour.home}, ${span}`)
      : fullHeading

    // Per-format position within the tour, for "2nd ODI" style labels on
    // rows that carry a match number ("ODI 5013") instead of an ordinal.
    const byFormat = {}
    for (const r of [...rows].sort((a, b) => a.dates.start - b.dates.start)) {
      (byFormat[r.matchType] ||= []).push(r)
    }

    for (const r of rows) {
      const teams = [r.home, r.away]
      // Bilateral tours always involve a tracked nation (parseTourHeading);
      // tournament games are all kept (see above).
      if (!isTournament && !teams.some(t => INTL_NATIONS.has(t.name))) continue

      const formatWord = FORMAT_WORD[r.matchType]
      const numbered = /\d{3,}/.test(r.label)
      let gameType
      if (isTournament) {
        gameType = r.stage && !/series/i.test(r.stage) ? `${formatWord} · ${r.stage}` : formatWord
      } else if (!numbered && /^(\d+(?:st|nd|rd|th)|Only)\b/i.test(r.label)) {
        gameType = r.label
      } else {
        const list = byFormat[r.matchType]
        gameType = list.length === 1 ? `Only ${formatWord}` : `${ordinal(list.indexOf(r) + 1)} ${formatWord}`
      }

      games.push({
        cricinfoId: r.cricinfoId,
        matchNumber: numbered ? r.label : null,
        matchType: r.matchType,
        gameType,
        seriesLabel,
        seriesArticle: article,
        seriesKind,
        seriesTeams: [...sides],
        season: seasonLabel,
        homeName: r.home.name, homePlaceholder: r.home.placeholder,
        awayName: r.away.name, awayPlaceholder: r.away.placeholder,
        start: r.dates.start,
        end: r.dates.end,
        venue: r.venue,
        result: r.result,
      })
    }
  }
  return games
}

// ─── Tour article scorecards ───────────────────────────────────────────────────

// Returns the body of every {{Single-innings cricket match}} and
// {{Two-innings cricket match}} template, matching braces so nested
// templates inside a value don't end the block early.
function findScorecardTemplates(text) {
  const out = []
  const re = /\{\{\s*(Single-innings|Two-innings) cricket match/gi
  let m
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index
    for (; i < text.length - 1; i++) {
      if (text[i] === '{' && text[i + 1] === '{') { depth++; i++ }
      else if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (depth === 0) break }
    }
    out.push({ kind: m[1].toLowerCase(), body: text.slice(m.index, i + 1) })
    re.lastIndex = i
  }
  return out
}

function templateParams(body) {
  const params = {}
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*\|\s*([\w -]+?)\s*=\s*(.*)$/)
    if (m) params[m[1].toLowerCase()] = m[2].trim()
  }
  return params
}

// "294/8 (50 overs)" → { r: 294, w: 8, o: 50 }; "235 (45.1 overs)" is all out;
// "426/6d (120 overs)" is a declaration.
function parseScore(raw) {
  const s = cleanText(raw)
  const m = s.match(/^(\d+)(?:\/(\d+))?\s*(d|dec)?/i)
  if (!m) return null
  const overs = s.match(/\(\s*([\d.]+)\s*overs?/i)
  return {
    r: parseInt(m[1]),
    w: m[2] != null ? parseInt(m[2]) : 10,
    o: overs ? parseFloat(overs[1]) : 0,
    dec: !!m[3],
  }
}

// "9 June 2026", "27–30 August 2026", "28 June–2 July 2026" → the start day as YYYY-MM-DD
function scorecardStartDay(raw) {
  const text = cleanText(raw)
  const day = text.match(/\d{1,2}/)
  const month = text.match(new RegExp(MONTHS.join('|'), 'i'))
  const year = text.match(/\d{4}/)
  if (!day || !month || !year) return null
  return utcDate(parseInt(year[0]), MONTH_INDEX[month[0].toLowerCase()], parseInt(day[0])).toISOString().slice(0, 10)
}

// Fallback key for matching a scorecard to its season-table row when the
// scorecard's report link isn't a Cricinfo one (some editors link Cricbuzz).
function teamsDayKey(teamA, teamB, day) {
  return `${[teamA, teamB].sort().join('|')}|${day}`
}

// Extracts per-match innings from a tour article, keyed by Cricinfo match id
// when the report links Cricinfo, otherwise by teams + start date.
export function parseScorecards(text) {
  const cards = new Map()
  for (const { kind, body } of findScorecardTemplates(text)) {
    const p = templateParams(body)
    const team1 = parseTeamCell(p.team1 || '').name
    const team2 = parseTeamCell(p.team2 || '').name
    const innings = { [team1]: [], [team2]: [] }
    const keys = kind === 'single-innings'
      ? [['score1', team1], ['score2', team2]]
      : [['score-team1-inns1', team1], ['score-team2-inns1', team2],
         ['score-team1-inns2', team1], ['score-team2-inns2', team2]]
    for (const [key, team] of keys) {
      const score = p[key] && parseScore(p[key])
      if (score) innings[team].push(score)
    }
    const id = cricinfoIdFromUrl(p.report)
    const day = scorecardStartDay(p.date || '')
    const key = id || (day && teamsDayKey(team1, team2, day))
    if (key) cards.set(key, { innings, result: cleanText(p.result || '') })
  }
  return cards
}

// ─── Normalize ─────────────────────────────────────────────────────────────────

// Season tables write results as "{{cr|NZ}} by 26 runs"; scorecards write
// "New Zealand won by 26 runs". Normalize to the latter, which is what
// resolveWinner/computeDifficulty expect.
function normalizeResult(result) {
  if (!result) return ''
  const m = result.match(/^(.+?) by (.+)$/)
  if (m && !/\bwon\b/i.test(m[1]) && (INTL_NATIONS.has(m[1].trim()) || /^[A-Z][A-Za-z ]+$/.test(m[1]))) {
    return `${m[1].trim()} won by ${m[2]}`
  }
  return result
}

// Editors update the result cell while a match is on ("Innings break",
// "Stumps", "Day 2: Lunch"), so only an actual outcome counts as final —
// anything else in the cell means the match is in progress.
const FINAL_RESULT = /\bwon\b|\bdrawn?\b|\btied?\b|no result|abandoned|cancelled|forfeit|conceded/i

function toGame(row, card) {
  const isTest = row.matchType === 'test'
  const resultText = normalizeResult(card?.result || row.result)
  const isFinal = FINAL_RESULT.test(resultText)
  const isLive = !!resultText && !isFinal
  const homeTeam = buildTeam({ name: row.homeName, placeholder: row.homePlaceholder })
  const awayTeam = buildTeam({ name: row.awayName, placeholder: row.awayPlaceholder })

  const homeInnings = card?.innings[row.homeName] ?? []
  const awayInnings = card?.innings[row.awayName] ?? []
  const winner = isFinal ? resolveWinner(resultText, row.homeName, row.awayName) : null
  const matchName = `${row.homeName} vs ${row.awayName}, ${row.gameType}, ${row.seriesLabel}`
  const dateStr = `${shortDate(row.start)}, ${row.start.getUTCFullYear()}`

  return {
    id:            row.cricinfoId || `wiki_${row.seriesLabel}_${row.gameType}`.replace(/\W+/g, '_'),
    league:        'cricket',
    source:        'wikipedia',
    matchType:     row.matchType,
    matchNumber:   row.matchNumber,
    homeTeam,
    awayTeam,
    homeScore:     null,
    awayScore:     null,
    homeScoreStr:  formatInnings(homeInnings, isTest),
    awayScoreStr:  formatInnings(awayInnings, isTest),
    homeInnings,
    awayInnings,
    homeWon:       winner === 'home',
    awayWon:       winner === 'away',
    status:        isFinal ? 'final' : isLive ? 'live' : 'scheduled',
    statusDetail:  resultText || 'Scheduled',
    gameDate:      row.start,
    // Last day of play: the scheduled end until a Test finishes, then the
    // actual one (Wikipedia records "22–23 August" for a two-day finish).
    endDate:       row.end,
    seriesStart:   row.seriesStart,
    dateRange:     isTest && !isFinal ? formatDateRange(row.start, row.end) : null,
    gameType:      row.gameType,
    difficulty:    isFinal ? computeDifficulty(resultText, row.matchType) : null,
    seriesLabel:   row.seriesLabel,
    seriesArticle: row.seriesArticle,
    seriesKind:    row.seriesKind,
    // Every side in the series, including associates whose own matches
    // aren't tracked — e.g. host Namibia in the Namibia tri-series.
    seriesTeams:   row.seriesTeams,
    highlightUrl:  isFinal
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${matchName} highlights ${dateStr}`)}`
      : null,
    venue:         row.venue,
  }
}

// ─── Season discovery ──────────────────────────────────────────────────────────

function adjacentSeasons(text) {
  const m = text.match(/\{\{\s*International cricket years\s*\|([^|}]*)\|([^|}]*)\}\}/i)
  return m ? { prev: m[1].trim(), next: m[2].trim() } : { prev: null, next: null }
}

function seasonOverlaps(label, fromYear, toYear) {
  const ys = seasonYears(label)
  return !!ys && ys[0] <= toYear && fromYear <= ys[1]
}

// Starts at toYear's calendar-year season page and follows the prev/next
// links for as long as the linked season still overlaps fromYear..toYear.
export async function fetchSeasonPages(fromYear, toYear = fromYear) {
  const pages = new Map() // label → text
  const start = `${toYear}`
  const first = (await fetchWikitexts([SEASON_PREFIX + start])).get(SEASON_PREFIX + start)
  if (!first) throw new Error(`Wikipedia page "${SEASON_PREFIX}${start}" not found`)
  pages.set(start, first.text)

  for (const dir of ['prev', 'next']) {
    let label = adjacentSeasons(first.text)[dir]
    while (label && !pages.has(label) && seasonOverlaps(label, fromYear, toYear)) {
      const page = (await fetchWikitexts([SEASON_PREFIX + label])).get(SEASON_PREFIX + label)
      if (!page) break
      pages.set(label, page.text)
      label = adjacentSeasons(page.text)[dir]
    }
  }
  return pages
}

// ─── Public API ────────────────────────────────────────────────────────────────

// A finished match whose scores are already held never needs its tour
// article again. Abandoned/no-result matches have no scores to wait for.
function hasFinalScores(game) {
  if (game?.status !== 'final') return false
  return !!(game.homeScoreStr || game.awayScoreStr) || /abandoned|no result|cancelled/i.test(game.statusDetail || '')
}

// Builds the international schedule from Wikipedia for every series that
// starts between fromYear and year — each series whole, including matches
// that spill into the following year (a December–February tour belongs to
// the year it starts in).
//
// previous: games from an earlier run (e.g. the Firestore cache). Finished
// matches already holding scores keep them, and their tour articles are only
// re-read if some other match in the same tour still needs scores — so a
// routine refresh reads just the season pages plus the handful of tours with
// newly-finished or in-progress matches.
export async function fetchWikiCricketGames({ year = new Date().getFullYear(), fromYear = year, previous = [] } = {}) {
  const previousById = new Map(previous.map(g => [g.id, g]))
  const knownScores = new Set(previous.filter(hasFinalScores).map(g => g.id))
  const pages = await fetchSeasonPages(fromYear, year)

  const allRows = []
  const seen = new Set()
  for (const [label, text] of pages) {
    for (const row of parseSeasonPage(text, label)) {
      const key = row.cricinfoId || `${row.seriesLabel}|${row.gameType}`
      if (seen.has(key)) continue // tours listed on two season pages, or duplicated rows
      seen.add(key)
      allRows.push(row)
    }
  }

  // Two different tours can share a display label (Australia played T20Is in
  // Pakistan in January and ODIs there in May, each with its own article) —
  // tell them apart by the month the tour started.
  const articlesByLabel = new Map()
  for (const r of allRows) {
    if (!articlesByLabel.has(r.seriesLabel)) articlesByLabel.set(r.seriesLabel, new Map())
    const firsts = articlesByLabel.get(r.seriesLabel)
    const key = r.seriesArticle || r.season
    if (!firsts.has(key) || r.start < firsts.get(key)) firsts.set(key, r.start)
  }
  for (const r of allRows) {
    const firsts = articlesByLabel.get(r.seriesLabel)
    if (firsts.size < 2) continue
    const first = firsts.get(r.seriesArticle || r.season)
    r.seriesLabel = r.seriesLabel.replace(/, (\d{4}(?:–\d{2})?)$/, `, ${MONTHS[first.getUTCMonth()].slice(0, 3)} $1`)
  }

  // A series belongs to the year its first match starts in. The season pages
  // read also hold series from just outside the range (partially), so keep
  // only series that start inside it.
  const seriesStart = new Map()
  for (const r of allRows) {
    if (!seriesStart.has(r.seriesLabel) || r.start < seriesStart.get(r.seriesLabel)) seriesStart.set(r.seriesLabel, r.start)
  }
  const rows = allRows.filter(r => {
    r.seriesStart = seriesStart.get(r.seriesLabel)
    const y = r.seriesStart.getUTCFullYear()
    return fromYear <= y && y <= year
  })

  // A tour article is needed for matches with a result but no stored scores,
  // and for matches that should be in progress right now — the season table
  // stays blank until a match ends, but the article's scorecard is updated
  // live ("Innings break", "Stumps Day 2").
  const now = Date.now()
  const inPlayWindow = r => r.start.getTime() - DAY_MS <= now && now <= r.end.getTime() + DAY_MS
  const needScores = rows.filter(r =>
    r.seriesArticle && !knownScores.has(r.cricinfoId) && (r.result || inPlayWindow(r)))
  const articles = [...new Set(needScores.map(r => r.seriesArticle))]
  const texts = await fetchWikitexts(articles)

  const cards = new Map()
  for (const { text } of texts.values()) {
    for (const [id, card] of parseScorecards(text)) cards.set(id, card)
  }

  const cardFor = r => (r.cricinfoId && cards.get(r.cricinfoId))
    || cards.get(teamsDayKey(r.homeName, r.awayName, r.start.toISOString().slice(0, 10)))
    || null

  let newResults = 0
  const games = rows
    .map(r => {
      const game = toGame(r, cardFor(r))
      const prev = previousById.get(game.id)
      if (game.status === 'final' && !hasFinalScores(prev)) newResults++
      // Tour article skipped this run — carry the stored scores forward.
      if (game.status === 'final' && !game.homeScoreStr && !game.awayScoreStr && hasFinalScores(prev)) {
        return {
          ...game,
          homeInnings: prev.homeInnings ?? [], awayInnings: prev.awayInnings ?? [],
          homeScoreStr: prev.homeScoreStr ?? null, awayScoreStr: prev.awayScoreStr ?? null,
        }
      }
      return game
    })
    .sort((a, b) => b.gameDate - a.gameDate)

  return {
    games,
    seasons: [...pages.keys()],
    articlesFetched: articles.length,
    newResults,
  }
}
