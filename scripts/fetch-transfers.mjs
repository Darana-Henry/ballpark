// Fetches each followed team's player moves for the Transfers tabs and writes
// src/data/transfers/<league>.json (committed as the fallback when a source is
// down; a league whose source fails keeps its existing file).
//
//   node scripts/fetch-transfers.mjs            every league
//   node scripts/fetch-transfers.mjs nfl mlb    just those
//
// Teams and sources:
// - MLB, Dodgers: MLB's transactions feed (statsapi), stats from statsapi
// - NBA, Lakers / NFL, Packers: ESPN's team transactions (plain sentences, no
//   ids), players looked up by name with ESPN's search for stats, age and the
//   latest RotoWire note; the NFL also gets league-wide trades
// - EPL, Man United / MLS, Inter Miami: Transfermarkt's .co.in mirror (fees
//   and market values in rupees, converted with the ECB rate from Frankfurter)
//   and its manager history; player intros from Wikipedia
// - BBL: the season's Wikipedia signings list (direct and overseas signings)
//   and coaching changes, league-wide
// Head-coach changes for the US teams: ESPN's head coach this season vs last.
//
// Two windows per team, so a just-finished season still has something to
// show: `current` since the latest off-season began (the league's boundary
// date below) and `previous`, the year before it.
//
// Each move's player details are fetched once and carried over from the
// existing file, so a 6-hourly run only looks up new moves.

import { readFile, writeFile, mkdir } from 'node:fs/promises'

const OUT_DIR = new URL('../src/data/transfers/', import.meta.url)
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' }
const WIKI_AGENT = 'Ballpark/1.0 (https://github.com/Darana-Henry/ballpark; personal sports tracker)'
const WIKI_HEADERS = { 'User-Agent': WIKI_AGENT, 'Api-User-Agent': WIKI_AGENT }
// New player lookups per league per run: a first run fills a whole year,
// later ones only look up what's new.
const MAX_LOOKUPS = 300

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function get(url, { headers = HEADERS, json = true, tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers })
      // Rate limited or a server hiccup: wait as asked (Wikipedia sends
      // Retry-After), capped, then try again.
      if (res.status === 429 || res.status >= 500) {
        const after = parseInt(res.headers.get('retry-after')) || 2 * (i + 1)
        await sleep(Math.min(after, 30) * 1000)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return json ? res.json() : res.text()
    } catch (err) {
      if (i === tries - 1) throw err
      await sleep(1000 * (i + 1))
    }
  }
  throw new Error(`gave up on ${url}`)
}

// ─── Windows ───────────────────────────────────────────────────────────────────

// The day each league's off-season starts: just after the MLB World Series,
// the Super Bowl, the NBA Finals, the end of the European and MLS seasons and
// the BBL final.
const BOUNDARY = { mlb: [10, 1], nfl: [1, 15], nba: [5, 25], epl: [5, 1], mls: [11, 15], bbl: [1, 1] }

function windows(league, now = new Date()) {
  const [m, d] = BOUNDARY[league]
  let start = new Date(Date.UTC(now.getUTCFullYear(), m, d))
  if (start > now) start = new Date(Date.UTC(now.getUTCFullYear() - 1, m, d))
  const prevStart = new Date(Date.UTC(start.getUTCFullYear() - 1, m, d))
  const iso = x => x.toISOString().slice(0, 10)
  return {
    current: { from: iso(start), to: iso(now) },
    previous: { from: iso(prevStart), to: iso(new Date(start - 86400000)) },
  }
}
const inWindow = (date, w) => date >= w.from && date <= w.to

// ─── Shared player helpers ────────────────────────────────────────────────────

const ESPN_SEARCH = 'https://site.web.api.espn.com/apis/common/v3/search'
const ESPN_COMMON = 'https://site.web.api.espn.com/apis/common/v3/sports'
const MOVE_WORDS = /\b(sign|signed|re-signed|waive|waived|release|released|trade|traded|acquire|acquired|claim|claimed|extension|extend|contract|deal|agree|agreed|promot|elevat|option|designat|cut)\w*/i

async function espnPlayer(name, sport, league) {
  const search = await get(`${ESPN_SEARCH}?query=${encodeURIComponent(name)}&limit=5&type=player`)
  const hit = (search.items ?? []).find(it => it.league === league && it.displayName?.toLowerCase() === name.toLowerCase())
    ?? (search.items ?? []).find(it => it.league === league)
  if (!hit) return null
  const [bio, overview] = await Promise.all([
    get(`${ESPN_COMMON}/${sport}/${league}/athletes/${hit.id}`).catch(() => null),
    get(`${ESPN_COMMON}/${sport}/${league}/athletes/${hit.id}/overview`).catch(() => null),
  ])
  const a = bio?.athlete ?? {}
  const s = overview?.statistics
  const splits = (s?.splits ?? []).filter(x => x.stats?.length)
  const stats = splits.slice(0, 2).map(x => ({
    label: x.displayName === 'Regular Season' ? `${s.displayName?.replace(/ Offense| Defense/, '') || 'This season'}` : x.displayName,
    values: (s.labels ?? []).map((l, i) => [l, x.stats[i]]).filter(([, v]) => v != null && v !== ''),
  }))
  const roto = overview?.rotowire
  // Only a note about a move: RotoWire's latest is often a game report.
  const noteText = [roto?.headline, roto?.story].filter(Boolean).join(' ')
  const note = roto && MOVE_WORDS.test(roto.headline ?? '') ? { text: noteText, date: roto.published ?? null, source: 'RotoWire' } : null
  return {
    espnId: hit.id,
    age: a.age ?? null,
    position: a.position?.displayName ?? null,
    experience: a.displayExperience ?? null,
    team: a.team?.displayName ?? null,
    stats,
    note,
  }
}

// The first two sentences of each player's Wikipedia article: who they are.
// Batched (Wikipedia allows 20 intro extracts a request) so a whole squad is a
// couple of requests; a name with no page, or a disambiguation page, falls
// back to one search ("<name> footballer") whose hit must carry the surname.
const WIKI_API = 'https://en.wikipedia.org/w/api.php'

// "(Brazilian Portuguese: [ɐ̃ˈdɾej …])" and "(, SHAY; born 14 April 2007)":
// pronunciation guides go, a birth date stays.
function cleanIntro(text) {
  return text
    .replace(/\s*\(([^()]*)\)/g, (all, inner) => {
      if (/\[|pronunciation|IPA|listen/i.test(inner)) return ''
      const kept = inner.includes(';') ? inner.split(';').pop().trim() : inner.replace(/^[,\s]+/, '')
      return kept ? ` (${kept})` : ''
    })
    .replace(/\s+([,.])/g, '$1')
    .trim()
}

async function extracts(titles) {
  const out = new Map()
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20)
    const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'extracts', exintro: '1', explaintext: '1', exsentences: '2', exlimit: '20', redirects: '1', titles: batch.join('|') })
    const q = (await get(`${WIKI_API}?${qs}`, { headers: WIKI_HEADERS }).catch(() => null))?.query
    if (!q) continue
    const asked = new Map(batch.map(t => [t, t]))
    for (const n of q.normalized ?? []) asked.set(n.to, asked.get(n.from) ?? n.from)
    for (const r of q.redirects ?? []) asked.set(r.to, asked.get(r.from) ?? r.from)
    for (const page of q.pages ?? []) {
      const text = page.extract?.trim()
      if (!page.missing && text && !/may refer to/.test(text)) out.set(asked.get(page.title) ?? page.title, cleanIntro(text))
    }
    await sleep(300)
  }
  return out
}

async function wikiIntros(players, hint) {
  const titles = [...new Set(players.map(p => p.wikiTitle ?? p.name))]
  const found = await extracts(titles)
  for (const title of titles.filter(t => !found.has(t))) {
    const sq = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', list: 'search', srsearch: `${title} ${hint}`, srlimit: '1' })
    const hit = (await get(`${WIKI_API}?${sq}`, { headers: WIKI_HEADERS }).catch(() => null))?.query?.search?.[0]?.title
    await sleep(300)
    if (!hit || !hit.toLowerCase().includes(title.split(' ').pop().toLowerCase())) continue
    const text = (await extracts([hit])).get(hit)
    if (text) found.set(title, text)
  }
  for (const p of players) {
    p.intro = found.get(p.wikiTitle ?? p.name) ?? null
    p.checked = true
  }
}

// ─── Verdicts ──────────────────────────────────────────────────────────────────
// An arrival is compared with the departure nearest in date at the same
// position group, on one number per league: OPS or ERA (MLB), points per game
// (NBA), market value (football). The NFL has no single comparable number, so
// it gets the pairing without a verdict. Within ±13% is a sideways move.

function verdictFrom(inVal, outVal, lowerIsBetter = false) {
  if (inVal == null || outVal == null || !outVal) return null
  const ratio = lowerIsBetter ? outVal / inVal : inVal / outVal
  return ratio > 1.13 ? 'Upgrade' : ratio < 0.87 ? 'Downgrade' : 'Sideways'
}

// One-to-one: each departure is matched to at most one arrival. Arrivals go
// in date order (biggest first on the same day: Transfermarkt gives a window,
// not dates), each taking the unused departure nearest in date, the biggest
// on a tie, so the marquee signing is set against the marquee exit.
function pairMoves(moves, groupOf, metricOf, describe) {
  const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000
  const size = m => metricOf(m.player)?.value ?? 0
  const ins = moves.filter(m => m.kind === 'in' && m.player)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : size(b) - size(a)))
  const outs = moves.filter(m => m.kind === 'out' && m.player)
  for (const m of ins) delete m.player.compare // carried over from the last run
  const used = new Set()
  for (const m of ins) {
    const group = groupOf(m.player)
    if (!group) continue
    const rival = outs
      .filter(o => !used.has(o) && groupOf(o.player) === group && o.player.name !== m.player.name)
      .sort((a, b) => days(a.date, m.date) - days(b.date, m.date) || size(b) - size(a))[0]
    if (!rival) {
      const anyLeft = outs.some(o => groupOf(o.player) === group)
      m.player.compare = { name: null, verdict: null, reason: anyLeft
        ? `Every ${group} who left is already set against another arrival, so this one adds to the group rather than replacing anyone.`
        : `No ${group} left in this window: a straight addition rather than a replacement.` }
      continue
    }
    used.add(rival)
    const mi = metricOf(m.player), mo = metricOf(rival.player)
    const verdict = mi && mo && mi.key === mo.key ? verdictFrom(mi.value, mo.value, mi.lowerIsBetter) : null
    m.player.compare = { name: rival.player.name, verdict, reason: describe(m.player, rival.player, mi, mo, verdict) }
  }
}

// ─── MLB (Dodgers) ─────────────────────────────────────────────────────────────

const MLB = 'https://statsapi.mlb.com/api/v1'
const DODGERS = 119
const MLB_IN = new Set(['SFA', 'SGN', 'CLW', 'TR'])
const MLB_OUT = new Set(['DES', 'REL', 'DFA', 'CLW', 'TR', 'RET'])
const MLB_PITCH = /^(RHP|LHP|P)$/

async function mlbPlayer(personId, season) {
  const data = await get(`${MLB}/people/${personId}?hydrate=stats(group=[hitting,pitching],type=[season],season=${season}),currentTeam`)
  const p = data.people?.[0]
  if (!p) return null
  const pitcher = p.primaryPosition?.type === 'Pitcher' || p.primaryPosition?.abbreviation === 'P' || p.primaryPosition?.code === '1'
  const group = (p.stats ?? []).find(s => s.group?.displayName === (pitcher ? 'pitching' : 'hitting'))
  const st = group?.splits?.[0]?.stat
  const values = !st ? [] : pitcher
    ? [['G', st.gamesPlayed], ['GS', st.gamesStarted], ['IP', st.inningsPitched], ['ERA', st.era], ['SO', st.strikeOuts], ['WHIP', st.whip]]
    : [['G', st.gamesPlayed], ['AVG', st.avg], ['HR', st.homeRuns], ['RBI', st.rbi], ['OPS', st.ops]]
  return {
    mlbId: personId,
    age: p.currentAge ?? null,
    position: p.primaryPosition?.name ?? null,
    pitcher,
    team: p.currentTeam?.name ?? null,
    stats: values.length ? [{ label: `${season} season`, values: values.filter(([, v]) => v != null) }] : [],
    metric: !st ? null : pitcher
      ? (parseFloat(st.inningsPitched) >= 20 ? { key: 'ERA', value: parseFloat(st.era), lowerIsBetter: true } : null)
      : (st.plateAppearances >= 60 ? { key: 'OPS', value: parseFloat(st.ops) } : null),
  }
}

async function fetchMLB(previous) {
  const w = windows('mlb')
  const data = await get(`${MLB}/transactions?teamId=${DODGERS}&startDate=${w.previous.from}&endDate=${w.current.to}`)
  const seen = new Set()
  const raw = (data.transactions ?? []).sort((a, b) => (a.date < b.date ? 1 : -1)).filter(t => {
    const key = t.description
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  const carry = carryOver(previous)
  let lookups = 0
  const moves = []
  for (const t of raw) {
    const desc = t.description
    const toUs = t.toTeam?.id === DODGERS, fromUs = t.fromTeam?.id === DODGERS
    let kind = 'depth'
    if (/minor league contract|to spring training/i.test(desc)) kind = 'depth'
    else if (/extension/i.test(desc)) kind = 'extension'
    else if (t.typeCode === 'TR') kind = toUs ? 'in' : 'out'
    else if (t.typeCode === 'CLW') kind = toUs ? 'in' : 'out'
    else if (MLB_IN.has(t.typeCode) && toUs) kind = 'in'
    else if (MLB_OUT.has(t.typeCode) && (fromUs || t.typeCode === 'DFA' || t.typeCode === 'DES' || t.typeCode === 'REL')) kind = 'out'
    if (['SC', 'NUM', 'ASG', 'OPT', 'CU', 'OUT', 'SE', 'R5M'].includes(t.typeCode) && kind === 'depth') kind = 'depth'
    if (t.typeCode === 'NUM' || t.typeCode === 'SC') continue // number changes, IL moves: not roster moves

    const id = `mlb_${t.id}`
    const move = { id, date: t.date, kind, trade: t.typeCode === 'TR', text: desc }
    if (kind !== 'depth' && t.person?.id) {
      const name = t.person.fullName
      const season = Number(t.date.slice(0, 4)) - (Number(t.date.slice(5, 7)) < 4 ? 1 : 0)
      let player = carry.get(id)
      if (!player && lookups < MAX_LOOKUPS) {
        lookups++
        const [stats, espn] = await Promise.all([
          mlbPlayer(t.person.id, season).catch(() => null),
          espnPlayer(name, 'baseball', 'mlb').catch(() => null),
        ])
        player = { name, ...(stats ?? {}), note: espn?.note ?? null, checked: !!stats }
        await sleep(150)
      }
      move.player = player ?? { name }
    }
    moves.push(move)
  }

  const coach = await espnCoachChange('baseball', 'mlb', 19, mlbSeasonYear())
  return finish('mlb', 'Los Angeles Dodgers', w, moves, {
    coach,
    groupOf: p => (p.pitcher ? 'pitcher' : p.position ? 'position player' : null),
    metricOf: p => p.metric ?? null,
    describe: (a, b, ma, mb, v) => ma && mb && ma.key === mb.key
      ? `${a.name} (${ma.key} ${ma.value}) vs ${b.name} (${mb.key} ${mb.value})${v ? `: ${v.toLowerCase()}` : ''}.`
      : `Closest like-for-like departure: ${b.name}. Not enough playing time to compare numbers.`,
  })
}

const mlbSeasonYear = () => new Date().getUTCFullYear()

// ─── ESPN team transactions (NBA, NFL) ─────────────────────────────────────────

const POS = 'QB|RB|FB|WR|TE|OT|OG|OL|T|G|C|DT|DE|DL|NT|LB|ILB|OLB|EDGE|CB|S|FS|SS|DB|K|P|LS|PG|SG|SF|PF|F|G-F|F-C|F/C|G/F'
const POS_RE = new RegExp(`\\b(?:${POS})s?\\b`)

// "Placed DTs Jonathan Ford, Javon Hargrave and WR Skyy Moore on injured
// reserve." → [{ pos: 'DT', name: 'Jonathan Ford' }, …]
function playersIn(sentence) {
  const out = []
  const re = new RegExp(`\\b(${POS})s?\\s+((?:[A-Z][\\w'’.-]*\\s?)+?(?:\\s(?:Jr\\.|Sr\\.|II|III|IV))?)(?=,|\\sand\\s|\\s(?:to|from|on|off|in|for|as|with|after|at)\\b|\\.|$)`, 'g')
  let m
  while ((m = re.exec(sentence))) out.push({ pos: m[1], name: m[2].trim().replace(/\.$/, m[2].endsWith('Jr.') || m[2].endsWith('Sr.') ? '.' : '') })
  // Names listed after a plural position ("DTs A, B and C") share it.
  const list = sentence.match(new RegExp(`\\b(${POS})s\\s+([^.]+?)(?=\\s(?:on|to|from|off)\\b|\\.|$)`))
  if (list) {
    for (const part of list[2].split(/,\s*|\s+and\s+/)) {
      const name = part.replace(POS_RE, '').trim()
      if (/^[A-Z][\w'’.-]+(\s[A-Z][\w'’.-]+)+$/.test(name) && !out.some(p => p.name === name)) out.push({ pos: list[1], name })
    }
  }
  return out
}

function classifyEspn(sentence) {
  const s = sentence.toLowerCase()
  if (/practice squad|two-way|exhibit 10|10-day/.test(s) && !/to a (?:standard|multi-year|rest-of-season)/.test(s)) return 'depth'
  if (/extension|extended/.test(s)) return 'extension'
  if (/^(placed|activated|recalled|assigned|designated .* return|reinstated|suspended)/.test(s)) return null
  if (/^(signed|re-signed|claimed|acquired|agreed|converted|exercised)/.test(s)) return /re-signed|exercised/.test(s) ? 'extension' : 'in'
  if (/^(waived|released|traded|terminated|cut)/.test(s)) return 'out'
  return null
}

async function espnTransactions(sport, league, teamId, w) {
  const years = [...new Set([w.previous.from, w.current.to].map(d => Number(d.slice(0, 4))))]
  for (let y = Number(w.previous.from.slice(0, 4)); y <= Number(w.current.to.slice(0, 4)); y++) years.push(y)
  const all = []
  for (const y of [...new Set(years)]) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/transactions?${teamId ? `team=${teamId}&` : ''}season=${y}&limit=1000`
    const data = await get(url).catch(() => ({ transactions: [] }))
    all.push(...(data.transactions ?? []))
  }
  const seen = new Set()
  return all
    .map(t => ({ date: t.date.slice(0, 10), description: t.description, team: t.team?.displayName ?? null }))
    .filter(t => t.description && inWindow(t.date, { from: w.previous.from, to: w.current.to }) && !seen.has(t.date + t.description) && seen.add(t.date + t.description))
}

async function espnTeamMoves(sport, league, teamId, w, previous) {
  const txs = await espnTransactions(sport, league, teamId, w)
  const carry = carryOver(previous)
  let lookups = 0
  const moves = []
  for (const t of txs) {
    const sentences = t.description.split(/(?<=[a-z0-9)]\.)\s+(?=[A-Z])/)
    sentences.forEach((sentence, si) => {
      const kind = classifyEspn(sentence)
      if (!kind) return
      // A trade names both sides: "Acquired X from Y in exchange for Z" brings
      // X in and sends Z out; "Traded Z to Y for X" the other way round.
      const swap = sentence.match(/^(.*?)\b(?:in exchange for|for)\b(.*)$/i)
      const isTrade = /^(acquired|traded)\b/i.test(sentence) && swap
      const sides = isTrade
        ? (/^traded/i.test(sentence)
            ? [[swap[1], 'out'], [swap[2], 'in']]
            : [[swap[1], 'in'], [swap[2], 'out']])
        : [[sentence, kind]]
      let any = false
      for (const [part, side] of sides) {
        for (const p of playersIn(part)) {
          any = true
          moves.push({ id: `${league}_${t.date}_${hash(p.name + sentence)}`, date: t.date, kind: side, trade: !!isTrade, text: sentence, player: { name: p.name, pos: p.pos } })
        }
      }
      if (!any) moves.push({ id: `${league}_${t.date}_${si}_${hash(sentence)}`, date: t.date, kind, trade: !!isTrade, text: sentence })
    })
  }
  for (const m of [...moves].sort(byDateDesc)) {
    if (!m.player || m.kind === 'depth') continue
    const old = carry.get(m.id)
    if (old) { m.player = old; continue }
    if (lookups >= MAX_LOOKUPS) continue
    lookups++
    await sleep(250) // ESPN starts refusing a fast run of searches
    const info = await espnPlayer(m.player.name, sport, league).catch(() => null)
    if (info) m.player = { ...m.player, ...info, checked: true }
  }
  return moves
}

function hash(s) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

const NBA_GROUP = { PG: 'guard', SG: 'guard', G: 'guard', 'G-F': 'wing', SF: 'wing', 'G/F': 'wing', F: 'forward', PF: 'forward', 'F-C': 'big', 'F/C': 'big', C: 'big' }
const NFL_GROUP = pos => ({ QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', OG: 'OL', OL: 'OL', T: 'OL', G: 'OL', C: 'OL', DT: 'DL', DE: 'DL', DL: 'DL', NT: 'DL', EDGE: 'DL', LB: 'LB', ILB: 'LB', OLB: 'LB', CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', DB: 'DB', K: 'K', P: 'P', LS: 'LS' }[pos] ?? null)

function nbaPpg(p) {
  for (const s of p.stats ?? []) {
    const gp = Number(s.values.find(([k]) => k === 'GP')?.[1])
    const pts = Number(s.values.find(([k]) => k === 'PTS')?.[1])
    if (gp >= 5 && Number.isFinite(pts)) return { key: 'PPG', value: pts }
  }
  return null
}

async function fetchNBA(previous) {
  const w = windows('nba')
  const moves = await espnTeamMoves('basketball', 'nba', 13, w, previous)
  const coach = await espnCoachChange('basketball', 'nba', 13, nbaSeasonYear())
  return finish('nba', 'Los Angeles Lakers', w, moves, {
    coach,
    groupOf: p => NBA_GROUP[p.pos] ?? null,
    metricOf: nbaPpg,
    describe: (a, b, ma, mb, v) => ma && mb
      ? `${a.name} (${ma.value} PPG) vs ${b.name} (${mb.value} PPG)${v ? `: ${v.toLowerCase()} in scoring` : ''}.`
      : `Closest like-for-like departure: ${b.name}. Not enough games to compare scoring.`,
  })
}
const nbaSeasonYear = () => { const n = new Date(); return n.getUTCMonth() >= 7 ? n.getUTCFullYear() + 1 : n.getUTCFullYear() }

async function fetchNFL(previous) {
  const w = windows('nfl')
  const moves = await espnTeamMoves('football', 'nfl', 9, w, previous)
  // League-wide trades: only the big picture, no player lookups.
  const league = await espnTransactions('football', 'nfl', null, w)
  const trades = []
  for (const t of league) {
    for (const sentence of t.description.split(/(?<=[a-z0-9)]\.)\s+(?=[A-Z])/)) {
      if (!/^(traded|acquired)\b/i.test(sentence)) continue
      trades.push({ id: `nfltrade_${t.date}_${hash((t.team ?? '') + sentence)}`, date: t.date, team: t.team, text: sentence })
    }
  }
  const coach = await espnCoachChange('football', 'nfl', 9, nflSeasonYear())
  const out = finish('nfl', 'Green Bay Packers', w, moves, {
    coach,
    groupOf: p => NFL_GROUP(p.pos),
    metricOf: () => null,
    describe: (a, b) => `Closest like-for-like departure: ${b.name}. The NFL has no single number that compares players across positions, so judge from the stats and note.`,
  })
  out.leagueMoves = {
    title: 'Trades around the league',
    current: trades.filter(t => inWindow(t.date, w.current)).sort(byDateDesc),
    previous: trades.filter(t => inWindow(t.date, w.previous)).sort(byDateDesc),
  }
  return out
}
const nflSeasonYear = () => { const n = new Date(); return n.getUTCMonth() >= 7 ? n.getUTCFullYear() : n.getUTCFullYear() - 1 }

// Head coach this season against last: a change shows as a coach move.
async function espnCoachChange(sport, league, teamId, season) {
  const coachIn = async y => {
    const list = await get(`https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/seasons/${y}/teams/${teamId}/coaches`).catch(() => null)
    const ref = list?.items?.[0]?.$ref
    if (!ref) return null
    const c = await get(ref.replace('http://', 'https://')).catch(() => null)
    return c ? `${c.firstName} ${c.lastName}` : null
  }
  const [now, before] = await Promise.all([coachIn(season), coachIn(season - 1)])
  if (!now) return null
  return { current: now, previous: before, changed: !!before && before !== now }
}

// ─── Football (Transfermarkt) ─────────────────────────────────────────────────

const TM = 'https://www.transfermarkt.co.in'
const tmText = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()

// "₹834.90 Cr" / "₹45.00 L" / "Loan fee:₹20.00 Cr" → rupees; free/loan/"-" → null.
function rupees(s) {
  const m = s?.match(/₹\s*([\d.,]+)\s*(Cr|L|Lakh|Th\.)?/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  const unit = (m[2] || '').toLowerCase()
  return n * (unit === 'cr' ? 1e7 : unit.startsWith('l') ? 1e5 : unit === 'th.' ? 1e3 : 1)
}

let fxCache = null
async function fx() {
  if (!fxCache) {
    const r = await get('https://api.frankfurter.dev/v1/latest?base=INR&symbols=EUR,GBP,USD').catch(() => get('https://api.frankfurter.app/latest?from=INR&to=EUR,GBP,USD'))
    fxCache = r.rates
  }
  return fxCache
}

function money(inr, rates, cur) {
  if (inr == null) return null
  const v = inr * rates[cur]
  const sym = { GBP: '£', USD: '$', EUR: '€' }[cur]
  return v >= 1e6 ? `${sym}${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}m` : `${sym}${Math.round(v / 1e3)}k`
}

function tmTransferTables(html) {
  const parts = html.split('class="items"')
  const out = {}
  parts.slice(1).forEach((table, i) => {
    const before = tmText(parts[i].slice(-2500))
    const heading = ['Arrivals', 'Departures'].map(h => ({ h, at: before.lastIndexOf(h) })).filter(x => x.at >= 0).sort((a, b) => b.at - a.at)[0]?.h
    if (!heading || out[heading]) return
    out[heading] = table.split(/<tr class="(?:odd|even)">/).slice(1).map(row => {
      const cells = row.split('</td>').map(tmText).filter(Boolean)
      const href = row.match(/href="(\/[^"]+\/profil\/spieler\/\d+)"/)?.[1] ?? null
      return { cells, href }
    })
  })
  return out
}

const POS_GROUP_FOOT = pos => /keeper/i.test(pos) ? 'goalkeeper' : /back|defender|centre-back/i.test(pos) ? 'defender' : /midfield/i.test(pos) ? 'midfielder' : /wing|forward|striker/i.test(pos) ? 'forward' : null

async function tmWindow(slug, id, seasonId, from, rates, cur, carry) {
  const html = await get(`${TM}/${slug}/transfers/verein/${id}/saison_id/${seasonId}/plus/1`, { json: false })
  const tables = tmTransferTables(html)
  const moves = []
  for (const [heading, kind] of [['Arrivals', 'in'], ['Departures', 'out']]) {
    for (const row of tables[heading] ?? []) {
      // [name, position, age, market value, club, league, fee]
      const [name, position, age, mv, rawClub, clubLeague, rawFee] = row.cells
      // The last row of a table runs into the page's footer links.
      const fee = rawFee?.split(/Quick Links|Most valuable/i)[0].trim()
      const club = /without club/i.test(rawClub ?? '') ? 'no club yet' : rawClub
      if (!name || !position) continue
      const loanBack = /end of loan/i.test(fee ?? '')
      const feeText = /free/i.test(fee ?? '') ? 'Free transfer' : /loan/i.test(fee ?? '') ? (loanBack ? 'Back from loan' : `Loan${rupees(fee) ? ` (fee ${money(rupees(fee), rates, cur)})` : ''}`) : fee === '-' || fee === '?' ? 'Undisclosed' : money(rupees(fee), rates, cur) ?? fee
      const moveId = `tm_${seasonId}_${kind}_${hash(name + club)}`
      // Promoted from (or sent back to) the club's own youth sides.
      const academy = /\b(U\d{2}|Academy|Youth|Reserves)\b/i.test(club ?? '')
      moves.push({
        id: moveId,
        date: from,
        // Loans coming back (or ending) aren't really signings or sales: the
        // player was the club's already, and often leaves again.
        kind: academy || /end of loan/i.test(fee ?? '') ? 'depth' : kind,
        text: `${kind === 'in' ? 'Signed' : 'Left'}: ${name} (${position}) ${kind === 'in' ? 'from' : 'to'} ${club}${clubLeague ? ` (${clubLeague})` : ''}, ${feeText}`,
        player: carry.get(moveId) ?? {
          name, position, age: Number(age) || null,
          club, clubLeague: clubLeague ?? null,
          fee: feeText,
          feeValue: rupees(fee) ? Math.round(rupees(fee) * rates[cur]) : null,
          marketValue: money(rupees(mv), rates, cur),
          marketValueNum: rupees(mv) ? Math.round(rupees(mv) * rates[cur]) : null,
          tmUrl: row.href ? `${TM.replace('.co.in', '.com')}${row.href}` : null,
        },
      })
    }
  }
  return moves
}

async function tmManagers(slug, id, w) {
  const html = await get(`${TM}/${slug}/mitarbeiterhistorie/verein/${id}`, { json: false })
  const part = html.split('class="items"')[1] ?? ''
  const rows = part.split(/<tr class="(?:odd|even)">/).slice(1).map(r => r.split('</td>').map(tmText).filter(Boolean))
  const date = s => { const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
  // [name, born, appointed, left/expected, days, matches, ppm]
  return rows
    .map(r => ({ name: r[0], from: date(r[2]), until: date(r[3]) }))
    .filter(r => r.name && r.from && r.from >= w.previous.from)
    .map(r => {
      const today = new Date().toISOString().slice(0, 10)
      const nice = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      const tail = !r.until ? '' : r.until > today ? `, contract to ${r.until.slice(0, 4)}` : `, left ${nice(r.until)}`
      return { id: `coach_${hash(r.name + r.from)}`, date: r.from, kind: 'coach', text: `${r.name} took charge on ${nice(r.from)}${tail}`, player: { name: r.name, role: 'Head coach' } }
    })
}

async function fetchTransfermarktTeam(league, team, slug, id, cur, previous, wikiHint) {
  const w = windows(league)
  const rates = await fx()
  const carry = carryOver(previous)
  // Transfermarkt numbers a season by its start year (MLS by its calendar year).
  const curId = Number(w.current.from.slice(0, 4)) + (league === 'mls' ? 1 : 0)
  const [now, before, coaches] = await Promise.all([
    tmWindow(slug, id, curId, w.current.from, rates, cur, carry),
    tmWindow(slug, id, curId - 1, w.previous.from, rates, cur, carry),
    tmManagers(slug, id, w).catch(() => []),
  ])
  const moves = [...now, ...before, ...coaches]
  const fresh = moves.filter(m => m.player && !m.player.checked).slice(0, MAX_LOOKUPS)
  await wikiIntros(fresh.filter(m => m.kind !== 'coach').map(m => m.player), wikiHint)
  await wikiIntros(fresh.filter(m => m.kind === 'coach').map(m => m.player), 'football manager')
  return finish(league, team, w, moves, {
    coach: null,
    groupOf: p => POS_GROUP_FOOT(p.position ?? ''),
    metricOf: p => (p.marketValueNum ? { key: 'MV', value: p.marketValueNum } : null),
    describe: (a, b, ma, mb, v) => ma && mb
      ? `${a.name} (valued ${a.marketValue}) vs ${b.name} (valued ${b.marketValue})${v ? `: ${v.toLowerCase()} on market value` : ''}.`
      : `Closest like-for-like departure: ${b.name}. One of them has no market value listed.`,
  })
}

// ─── BBL (Wikipedia) ───────────────────────────────────────────────────────────

const bblTitle = y => `List of ${y}–${String((y + 1) % 100).padStart(2, '0')} Big Bash League personnel signings`
const bblSeasonTitle = y => `${y}–${String((y + 1) % 100).padStart(2, '0')} Big Bash League season`

async function wikiText(title) {
  const qs = new URLSearchParams({ action: 'parse', format: 'json', formatversion: '2', prop: 'wikitext', redirects: '1', page: title })
  const d = await get(`https://en.wikipedia.org/w/api.php?${qs}`, { headers: WIKI_HEADERS }).catch(() => null)
  return d?.parse?.wikitext ?? ''
}

const linkTarget = s => s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
const linkText = s => { const m = linkTarget(s); return m ? (m[2] ?? m[1]).trim() : s.replace(/\{\{[^}]*\}\}|<[^>]+>/g, '').trim() }

function bblSignings(text, from) {
  const moves = []
  for (const [section, overseas] of [['==Direct signings==', false], ['==Overseas signings==', true]]) {
    const i = text.indexOf(section)
    if (i < 0) continue
    const table = text.slice(i, text.indexOf('|}', i))
    let team = null
    for (const row of table.split(/\n\|-/).slice(1)) {
      const lines = row.split('\n').map(l => l.trim()).filter(Boolean)
      const playerLine = lines.find(l => l.startsWith('!') && /\[\[/.test(l))
      if (!playerLine) continue
      const cells = lines.filter(l => l.startsWith('|') && !l.startsWith('|+'))
      const teamCell = cells.find(c => /\[\[/.test(c) && !/\{\{\s*cr/i.test(c))
      if (teamCell) team = linkText(teamCell.replace(/^\|\s*(?:rowspan="?\d+"?\s*\|)?/, ''))
      const nat = cells.find(c => /\{\{\s*cr/i.test(c))?.match(/\{\{\s*cr\|([A-Z]+)/i)?.[1] ?? null
      const link = linkTarget(playerLine)
      const name = link ? (link[2] ?? link[1]).trim() : linkText(playerLine)
      moves.push({
        id: `bbl_${hash(name + team)}`,
        date: from,
        kind: 'in',
        team,
        text: `${team}: signed ${name}${overseas ? ` (overseas${nat ? `, ${nat}` : ''})` : ''}`,
        player: { name, wikiTitle: link?.[1]?.trim() ?? name, overseas, nationality: nat, team },
      })
    }
  }
  return moves
}

function bblCoaching(text, from) {
  const i = text.indexOf('==== Coaching changes ====')
  if (i < 0) return []
  const prose = text.slice(i, text.indexOf('\n===', i + 10)).replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '')
  return prose.split(/\n\n+/).slice(0, 6).map(p => p.replace(/^=+[^=]+=+\s*/, '').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').trim())
    .filter(Boolean)
    .map(p => ({ id: `bblcoach_${hash(p)}`, date: from, kind: 'coach', text: p }))
}

async function fetchBBL(previous) {
  const w = windows('bbl')
  const carry = carryOver(previous)
  const y = Number(w.current.from.slice(0, 4))
  const [nowList, nowSeason, prevList, prevSeason] = await Promise.all([
    wikiText(bblTitle(y)), wikiText(bblSeasonTitle(y)), wikiText(bblTitle(y - 1)), wikiText(bblSeasonTitle(y - 1)),
  ])
  if (!nowList && !prevList) throw new Error('no BBL signings pages')
  const moves = [
    ...bblSignings(nowList, w.current.from), ...bblCoaching(nowSeason, w.current.from),
    ...bblSignings(prevList, w.previous.from), ...bblCoaching(prevSeason, w.previous.from),
  ]
  for (const m of moves) {
    const old = m.player && carry.get(m.id)
    if (old) m.player = old
  }
  await wikiIntros(moves.filter(m => m.player && !m.player.checked).slice(0, MAX_LOOKUPS).map(m => m.player), 'cricketer')
  // League-wide: the whole list is the "league moves", grouped by team in the tab.
  return finish('bbl', 'Big Bash League', w, moves, { coach: null, groupOf: () => null, metricOf: () => null, describe: () => '' })
}

// ─── Assemble ──────────────────────────────────────────────────────────────────

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)

function carryOver(previous) {
  const map = new Map()
  for (const w of ['current', 'previous']) {
    // Only players whose lookup worked: a failed one is tried again.
    for (const m of previous?.[w] ?? []) if (m.player?.checked) map.set(m.id, m.player)
  }
  return map
}

function finish(league, team, w, moves, { coach, groupOf, metricOf, describe }) {
  const current = moves.filter(m => inWindow(m.date, w.current))
  const prev = moves.filter(m => inWindow(m.date, w.previous))
  for (const list of [current, prev]) pairMoves(list, groupOf, metricOf, describe)
  if (coach?.changed) {
    current.push({ id: `coach_${league}_${coach.current}`, date: w.current.from, kind: 'coach', text: `${coach.current} replaced ${coach.previous} as head coach`, player: { name: coach.current, role: 'Head coach' } })
  }
  return {
    league,
    team,
    generatedAt: new Date().toISOString(),
    windows: w,
    coach,
    current: current.sort(byDateDesc),
    previous: prev.sort(byDateDesc),
  }
}

const FETCHERS = {
  mlb: fetchMLB,
  nba: fetchNBA,
  nfl: fetchNFL,
  epl: prev => fetchTransfermarktTeam('epl', 'Manchester United', 'manchester-united', 985, 'GBP', prev, 'footballer'),
  mls: prev => fetchTransfermarktTeam('mls', 'Inter Miami CF', 'inter-miami-cf', 69261, 'USD', prev, 'footballer'),
  bbl: fetchBBL,
}

async function main() {
  const asked = process.argv.slice(2)
  const leagues = asked.length ? asked : Object.keys(FETCHERS)
  await mkdir(OUT_DIR, { recursive: true })
  for (const league of leagues) {
    const file = new URL(`${league}.json`, OUT_DIR)
    const previous = await readFile(file, 'utf8').then(JSON.parse).catch(() => null)
    try {
      const data = await FETCHERS[league](previous)
      await writeFile(file, JSON.stringify(data) + '\n')
      const count = k => data[k].filter(m => m.kind !== 'depth').length
      console.log(`transfers: ${league} — ${count('current')} moves this window, ${count('previous')} last`)
    } catch (err) {
      console.warn(`transfers: ${league} failed (${err.message}), kept the existing file`)
    }
  }
}

main()
