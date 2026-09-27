// Nation constants and result helpers shared by the international cricket
// data sources (CricAPI in src/api/intlCricket.js, Wikipedia in
// src/api/wikiCricket.js). Kept free of Firebase/Vite imports so the
// Wikipedia reader can also run under plain Node for dry runs.

export const INTL_NATIONS = new Set([
  'England', 'South Africa', 'Australia', 'New Zealand',
  'India', 'Pakistan', 'West Indies', 'Sri Lanka',
  'Bangladesh', 'Zimbabwe', 'Afghanistan', 'Ireland',
])

export const NATION_ABBR = {
  'England':      'ENG', 'South Africa': 'SA',  'Australia':    'AUS',
  'New Zealand':  'NZ',  'India':        'IND', 'Pakistan':     'PAK',
  'West Indies':  'WI',  'Sri Lanka':    'SL',  'Bangladesh':   'BAN',
  'Zimbabwe':     'ZIM', 'Afghanistan':  'AFG', 'Ireland':      'IRE',
}

// Ordered list of the 12 Full Member nations this tab tracks — exported so
// views can build a country filter dropdown without re-declaring the list.
export const NATIONS = [...INTL_NATIONS]

export const NATION_COLORS = {
  'England':      '#3b82f6', 'South Africa': '#16a34a', 'Australia':    '#f59e0b',
  'New Zealand':  '#9ca3af', 'India':        '#4d90d3', 'Pakistan':     '#15803d',
  'West Indies':  '#dc2626', 'Sri Lanka':    '#6366f1', 'Bangladesh':   '#0d9488',
  'Zimbabwe':     '#84cc16', 'Afghanistan':  '#0891b2', 'Ireland':      '#86efac',
}

// Associate sides that turn up in tri-series and tournaments alongside the
// tracked nations. Only used to name them (e.g. in a tri-series' team list);
// their own matches are still filtered out. Unlisted codes show as the code.
export const ASSOCIATE_NAMES = {
  NAM: 'Namibia',     SCO: 'Scotland',      NED: 'Netherlands',   NEP: 'Nepal',
  UAE: 'UAE',         OMA: 'Oman',          USA: 'United States', CAN: 'Canada',
  HK:  'Hong Kong',   JPN: 'Japan',         MAS: 'Malaysia',      PNG: 'Papua New Guinea',
  KEN: 'Kenya',       UGA: 'Uganda',        ITA: 'Italy',         KUW: 'Kuwait',
  BHR: 'Bahrain',     QAT: 'Qatar',         SIN: 'Singapore',     THA: 'Thailand',
  JER: 'Jersey',      TAN: 'Tanzania',      NGA: 'Nigeria',       BER: 'Bermuda',
}

const ASSOCIATE_CODES = Object.fromEntries(Object.entries(ASSOCIATE_NAMES).map(([code, name]) => [name, code]))

// Short code for any side: "IND", "SA", "NAM". Unknown names fall back to
// their first three letters.
export function teamCode(name) {
  return NATION_ABBR[name] || ASSOCIATE_CODES[name] || name.slice(0, 3).toUpperCase()
}

export function computeDifficulty(statusDetail, matchType) {
  if (!statusDetail) return null
  const d = statusDetail.toLowerCase()
  if (matchType === 'test') {
    if (d.includes('draw') || d.includes('drawn')) return { label: 'Hard Fought', cls: 'bg-sky-500/20 text-sky-400 border border-sky-500/30' }
    if (d.includes('innings'))                      return { label: 'Dominant',    cls: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' }
  }
  const wm = d.match(/won by (\d+) (?:wickets?|wkts?)/)
  if (wm) {
    const w = parseInt(wm[1])
    if (w <= 2) return { label: 'Thriller',   cls: 'bg-red-500/20 text-red-400 border border-red-500/30' }
    if (w <= 4) return { label: 'Close',       cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' }
    if (w <= 6) return { label: 'Competitive', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' }
    return       { label: 'Comfortable',  cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' }
  }
  const rm = d.match(/won by (\d+) runs?/)
  if (rm) {
    const r = parseInt(rm[1])
    const closeThreshold = matchType === 'test' ? 15 : 10
    const compThreshold  = matchType === 'test' ? 50 : 25
    if (r <= closeThreshold) return { label: 'Thriller',   cls: 'bg-red-500/20 text-red-400 border border-red-500/30' }
    if (r <= compThreshold)  return { label: 'Close',       cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' }
    if (r <= 150)            return { label: 'Competitive', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' }
    return                          { label: 'Comfortable', cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' }
  }
  return null
}

export function resolveWinner(statusDetail, homeName, awayName) {
  if (!statusDetail) return null
  const d = statusDetail.toLowerCase()
  if (d.includes('drawn') || d.includes('draw')) return 'draw'
  if (d.includes('abandoned') || d.includes('no result')) return 'nr'
  const m = statusDetail.match(/^(.+?)\s+won\s+by/i)
  if (!m) return null
  const winner = m[1].trim().toLowerCase()
  if (homeName.toLowerCase().includes(winner) || winner.includes(homeName.toLowerCase().split(' ')[0])) return 'home'
  if (awayName.toLowerCase().includes(winner) || winner.includes(awayName.toLowerCase().split(' ')[0])) return 'away'
  return null
}

// Makes sure every game carries its series type ('bilateral', 'tri-series'
// or 'tournament') and series start date. The Wikipedia reader tags both;
// games without them — stored before they existed, or already held in
// memory — get them from the series itself: the type from its name, then how
// many different sides play in it; the start from its earliest match.
const TRI_NAME = /tri-?(?:nation|series)|triangular/i
const TOURNAMENT_NAME = /\bcup\b|\bgames\b|trophy|championship|tournament|qualifier/i

export function withSeriesInfo(games) {
  if (games.every(g => g.seriesKind && g.seriesStart)) return games
  const sides = new Map()
  const starts = new Map()
  for (const g of games) {
    if (!sides.has(g.seriesLabel)) sides.set(g.seriesLabel, new Set())
    sides.get(g.seriesLabel).add(g.homeTeam.name).add(g.awayTeam.name)
    if (!starts.has(g.seriesLabel) || g.gameDate < starts.get(g.seriesLabel)) starts.set(g.seriesLabel, g.gameDate)
  }
  const kindOf = label => {
    const n = sides.get(label).size
    if (TRI_NAME.test(label) || n === 3) return 'tri-series'
    if (TOURNAMENT_NAME.test(label) || n > 3) return 'tournament'
    return 'bilateral'
  }
  return games.map(g => ({
    ...g,
    seriesKind: g.seriesKind || kindOf(g.seriesLabel),
    seriesStart: g.seriesStart || starts.get(g.seriesLabel),
  }))
}

// The year a series belongs to: the year its first match starts in.
export const seriesYear = g => (g.seriesStart ?? g.gameDate).getUTCFullYear()

// Every game of every series with at least one match in `year` — whole
// series, so a tour crossing New Year brings its matches from the other year
// too. This is the "now" slice used by the Matches queue, Results Log, Home
// and Stats; the Series tab instead groups by seriesYear.
export function seriesActiveInYear(games, year = new Date().getFullYear()) {
  const active = new Set(games.filter(g => g.gameDate.getUTCFullYear() === year).map(g => g.seriesLabel))
  return games.filter(g => active.has(g.seriesLabel))
}

// Innings as { r, w, o, dec? } → "294/8 (50)" / "235 (45.1)" for limited
// overs, "426/6d" / "290" for Tests; a team's innings are joined with " & ".
function fmtInning(i, isTest) {
  if (isTest) return i.w >= 10 ? `${i.r}` : `${i.r}/${i.w}${i.dec ? 'd' : ''}`
  return i.w >= 10 ? `${i.r} (${i.o})` : `${i.r}/${i.w} (${i.o})`
}

export function formatInnings(innings, isTest) {
  if (!innings?.length) return null
  return innings.map(i => fmtInning(i, isTest)).join(' & ')
}
