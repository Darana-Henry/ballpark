// Helpers the fantasy data scripts share (scripts/fetch-fantasy-players.mjs,
// scripts/import-bundesliga-fantasy.mjs): fetching, name matching across
// sources, ESPN penalties and Transfermarkt absences, so every fantasy
// league's players get the same extras the same way.

export const HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36' }
// transfermarkt.com doesn't answer scripted requests; the .co.in mirror does.
const TRANSFERMARKT = 'https://www.transfermarkt.co.in'
const espnBase = slug => `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}`

export async function get(url, headers = HEADERS) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res
}

export const getJson = url => get(url).then(res => res.json())

// "Bodø/Glimt" and "Bodo/Glimt", "Sørensen" and "Sorensen", "Malmö" and "Malmo", "Groß" and "Gross" compare equal.
export function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ł/g, 'l').replace(/đ/g, 'd')
    .replace(/[.,]/g, '').replace(/ (jr|sr)$/, '').replace(/\s+/g, ' ').trim()
}

export async function mapLimit(items, limit, fn) {
  const out = []
  for (let i = 0; i < items.length; i += limit) out.push(...await Promise.all(items.slice(i, i + limit).map(fn)))
  return out
}

// This season's league matches for an ESPN soccer league slug (e.g.
// 'ger.1'). ESPN ignores date ranges, so one scoreboard request per month of
// the season (see src/api/espnDates.js); `season` is its first month and
// length in months.
export async function fetchEspnEvents(slug, year, season) {
  const months = Array.from({ length: season.months }, (_, i) => {
    const m = season.start - 1 + i
    return `${year + Math.floor(m / 12)}${String((m % 12) + 1).padStart(2, '0')}`
  })
  const pages = await Promise.all(months.map(m => getJson(`${espnBase(slug)}/scoreboard?dates=${m}&limit=300`).then(d => d.events ?? [])))
  const seen = new Set()
  return pages.flat().filter(e => e?.id && !seen.has(e.id) && seen.add(e.id))
}

// Every penalty in this season's finished league matches.
export async function fetchPenalties(slug, espnEvents) {
  const ids = espnEvents.filter(e => e.status?.type?.completed).map(e => e.id)
  const summaries = await mapLimit(ids, 8, id => getJson(`${espnBase(slug)}/summary?event=${id}`))
  const penalties = []
  summaries.forEach((s, i) => {
    for (const k of s.keyEvents ?? []) {
      const type = k.type?.type ?? ''
      const name = k.participants?.[0]?.athlete?.displayName
      // A saved penalty names the goalkeeper; the taker gets his own "missed" event.
      if (!type.startsWith('penalty---') || type === 'penalty---saved' || !name) continue
      penalties.push({ name, scored: type === 'penalty---scored', date: s.header?.competitions?.[0]?.date ?? null, match: ids[i] })
    }
  })
  return { matches: ids.length, penalties }
}

const firstWord = s => s.split(/[ -]/)[0]
const lastWord = s => s.split(/[ -]/).at(-1)

// ESPN and Transfermarkt name players in full, with or without middle names
// ("Bilal Njie" for "Bilal Elmi Njie", "Ousmane Diallo" for "Ousmane Diallo
// Toure"), so fall back to first given name + any surname word. clubName
// breaks a tie between namesakes.
export function matchPlayer(name, elements, teamNames, clubName) {
  const key = norm(name)
  const full = e => norm(`${e.first_name} ${e.second_name}`)
  const pick = candidates => {
    if (candidates.length <= 1 || !clubName) return candidates.length === 1 ? candidates[0] : null
    const club = norm(clubName)
    const sameClub = candidates.filter(e => club.includes(norm(teamNames[e.team])))
    return sameClub.length === 1 ? sameClub[0] : null
  }
  // Also the given names alone when there are two ("Igor Thiago" for Igor
  // Thiago Nascimento Rodrigues), and family name first reversed ("Mitoma Kaoru").
  const forms = e => [
    full(e),
    norm(`${firstWord(e.first_name)} ${e.second_name}`),
    norm(e.web_name),
    norm(`${e.second_name} ${e.first_name}`),
    ...(e.first_name.includes(' ') ? [norm(e.first_name)] : []),
  ]
  const exact = elements.filter(e => forms(e).includes(key))
  if (exact.length) return pick(exact)
  const named = elements.filter(e =>
    firstWord(norm(e.first_name)) === firstWord(key) && norm(e.second_name).split(/[ -]/).includes(lastWord(key)))
  if (named.length) return pick(named)
  // Spelling differs in the given name ("Nikolas"/"Nicolas"): a surname unique in the league.
  return pick(elements.filter(e => lastWord(norm(e.second_name)) === lastWord(key)))
}

// Transfermarkt list pages: one <table class="items"> per list, one row per
// player. Cells (unfiltered) are [_, name, position, _, _, value, value…];
// the second title attribute after the player's is his club.
//
// Tables are found by the heading before them, not their order: a list with
// nothing in it ("No information available") has no table at all, which
// shifts every table after it.
function transfermarktTables(html, headings) {
  const text = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  const parts = html.split('class="items"')
  const found = {}
  parts.slice(1).forEach((table, i) => {
    const before = text(parts[i].slice(-3000))
    const heading = headings
      .map(h => ({ h, at: before.lastIndexOf(h) }))
      .filter(x => x.at !== -1)
      .sort((a, b) => b.at - a.at)[0]?.h
    if (!heading || found[heading]) return
    found[heading] = table.split(/<tr class="(?:odd|even)">/).slice(1).map(row => ({
      cells: row.split('</td>').map(text),
      club: [...row.matchAll(/title="([^"]+)"/g)].map(m => m[1])[2] ?? null,
    }))
  })
  return found
}

// "01/03/2027" (day first) → "2027-03-01"; blank when the return is unknown.
function tmDate(s) {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

// Injuries, suspensions and ban risk for a league; `path` is its
// Transfermarkt list path with a {page} slot, e.g.
// 'bundesliga/{page}/wettbewerb/L1'.
export async function fetchTransfermarkt(path) {
  const headers = { ...HEADERS, 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'en-GB,en;q=0.9' }
  const page = which => get(`${TRANSFERMARKT}/${path.replace('{page}', which)}`, headers).then(res => res.text())
  const [injuredHtml, suspendedHtml] = await Promise.all([page('verletztespieler'), page('sperrenausfaelle')])
  const { 'injured players': injured = [] } = transfermarktTables(injuredHtml, ['injured players'])
  // Suspensions and other absences, and players one booking from a ban.
  const { Suspensions: suspended = [], 'Risk of suspension': yellows = [] } =
    transfermarktTables(suspendedHtml, ['Suspensions', 'Risk of suspension'])
  if (!injured.length && !suspended.length && !yellows.length) throw new Error('no rows; the page layout may have changed')
  return {
    absences: [
      ...injured.map(({ cells, club }) => ({ name: cells[1], club, type: 'injury', reason: cells[5], until: tmDate(cells[6]) })),
      ...suspended.map(({ cells, club }) => ({ name: cells[1], club, type: 'suspension', reason: cells[5], until: tmDate(cells[6]) })),
    ],
    yellows: yellows.map(({ cells, club }) => ({ name: cells[1], club, cards: Number(cells[5]) })),
  }
}
