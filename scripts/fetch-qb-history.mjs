#!/usr/bin/env node
// Populate src/data/nflQuarterbacks.js from Wikipedia's per-team
// "List of <team> starting quarterbacks" articles.
//
//   node scripts/fetch-qb-history.mjs [--since 2016]
//
// Those articles are the only source found that publishes games STARTED per
// quarterback per season — ESPN's API exposes gamesPlayed only. Each season row
// reads `[[Josh Allen]] <small>(11)</small> / [[Nathan Peterman]] <small>(5)</small>`,
// which is exactly the shape the app renders.

import { writeFileSync, readFileSync } from 'node:fs'
import { NFL_TEAMS } from '../src/constants/nflTeams.js'

const API = 'https://en.wikipedia.org/w/api.php'
const UA = 'ballpark-qb-history/1.0 (personal sports tracker)'

const sinceArg = process.argv.indexOf('--since')
const SINCE = sinceArg > -1 ? Number(process.argv[sinceArg + 1]) : 2016

// One batched revisions query beats 32 action=parse calls, which get HTTP 429'd.
async function fetchArticles(titles) {
  const params = new URLSearchParams({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    titles: titles.join('|'), redirects: '1', format: 'json', formatversion: '2',
  })
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`)
  const data = await res.json()

  // Redirects and title normalisation both rewrite the title we asked for, so
  // walk the chain back to map each returned page onto its requested title.
  const backlink = new Map()
  for (const { from, to } of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) {
    backlink.set(to, from)
  }
  const original = title => {
    let t = title
    const seen = new Set()
    while (backlink.has(t) && !seen.has(t)) { seen.add(t); t = backlink.get(t) }
    return t
  }

  const byTitle = {}
  for (const page of data.query?.pages ?? []) {
    if (page.missing) continue
    const content = page.revisions?.[0]?.slots?.main?.content
    if (content) byTitle[original(page.title)] = content
  }
  return byTitle
}

// Strip templates first — {{efn-ur|…}} footnotes wrap prose that would
// otherwise survive into a quarterback's name.
function stripTemplates(s) {
  // {{small|(17)}} is an alternate spelling of <small>(17)</small>; unwrap it
  // so the count survives the template strip below.
  let out = s.replace(/\{\{\s*small\s*\|([^{}]*)\}\}/gi, '$1')
  let prev
  do { prev = out; out = out.replace(/\{\{[^{}]*\}\}/g, '') } while (out !== prev)
  return out
}

// `[[Josh Allen (quarterback)|Josh Allen]]` -> `Josh Allen`. Links are resolved
// before any count is read: a disambiguation suffix like "(American football)"
// would otherwise be mistaken for the games-started number, silently dropping
// the real count.
function resolveLinks(s) {
  return s
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]|]*?)\s*\([^)]*\)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
}

function cleanName(s) {
  return resolveLinks(stripTemplates(s))
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[†‡*']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseQuarterbacks(cell) {
  // Strip every tag before splitting on "/": a closing </small> or </sup>, and
  // any URL inside a <ref>, all contain slashes that would cut names in half.
  const flat = stripTemplates(cell)
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<[^>]*>/g, '')

  return flat
    .split('/')
    .map(part => {
      const resolved = resolveLinks(part).trim()
      // The count trails the name, so anchor the match to the end of the cell.
      const inner = resolved.match(/\(([^)]*)\)[^)]*$/)?.[1] ?? ''
      const record = inner.match(/^(\d+)\s*[–-]\s*(\d+)(?:\s*[–-]\s*(\d+))?$/)
      const starts = inner.match(/^(\d+)$/)

      const name = cleanName(resolved.replace(/\([^)]*\)[^)]*$/, ''))
      if (!name || /^\d+$/.test(name)) return null

      if (starts) return { name, starts: Number(starts[1]) }
      if (record) return { name, record: [record[1], record[2], record[3]].filter(Boolean).join('-') }
      return { name }
    })
    .filter(Boolean)
}

// Rows come in two shapes: cells inline on one line separated by `||`, and
// cells each on their own `|`-prefixed line. Both appear in the same table.
function rowCells(chunk) {
  const cells = []
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim()
    // Season cells are often header cells (`! scope="row" | [[2021 …]]`)
    // rather than data cells, so both markers count.
    const isCell = (trimmed.startsWith('|') || trimmed.startsWith('!'))
      && !trimmed.startsWith('|-') && !trimmed.startsWith('|}') && !trimmed.startsWith('|+')
    if (!isCell) continue
    for (const cell of trimmed.replace(/^[|!]/, '').split(/\|\||!!/)) cells.push(cell)
  }
  return cells
}

// Article structure varies: the season table sits under "Regular season" on
// most pages and "Quarterback starts (by season)" on others, and some pages
// repeat those headings under a later records or timeline section. Rather than
// match headings, parse every wikitable and keep those carrying a start count
// or a win-loss record. A timeline or records table has neither.
function extractTables(wikitext) {
  const tables = []
  const re = /\{\|/g
  let m
  while ((m = re.exec(wikitext))) {
    const end = wikitext.indexOf('\n|}', m.index)
    if (end === -1) continue
    // The nearest preceding heading says whether this is the postseason table,
    // which repeats seasons with playoff-only starts.
    const heading = [...wikitext.slice(0, m.index).matchAll(/^[=;]+\s*(.+?)\s*=*$/gm)].pop()?.[1] ?? ''
    tables.push({ heading, body: wikitext.slice(m.index, end) })
    re.lastIndex = end
  }
  return tables
}

// Drop `align=left|` style attributes preceding the cell content, plus any
// stray leading pipe left by markup like `|| |[[Patrick Mahomes]]`.
const cellContent = cell => {
  const m = cell.match(/^\s*(?:[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^|\s]+)\s*)+\|(?!\|)([\s\S]*)$/i)
  return (m ? m[1] : cell).replace(/^\s*\|/, '').trim()
}

const MAX_COLUMNS = 8

// A quarterback who started every game across several seasons is written once
// with rowspan="9", and the seasons it covers carry no cell of their own. Track
// the span so those rows resolve to the same quarterback instead of coming back
// empty (Russell Wilson 2012-2020, Tom Brady 2018-2019).
function parseSeasonTable(table) {
  const seasons = {}
  const carry = []

  for (const chunk of table.split(/\n\|-/)) {
    const raw = rowCells(chunk)
    // Skip the header and any row without a season, so neither consumes a span.
    if (!raw.length || !/\d{4}/.test(chunk)) continue

    const cells = []
    let next = 0
    for (let col = 0; col < MAX_COLUMNS; col++) {
      if (carry[col]?.rows > 0) {
        cells[col] = carry[col].content
        carry[col].rows -= 1
      } else if (next < raw.length) {
        const cell = raw[next++]
        const span = Number(cell.match(/rowspan\s*=\s*"?(\d+)"?/i)?.[1] ?? 1)
        cells[col] = cellContent(cell)
        if (span > 1) carry[col] = { content: cells[col], rows: span - 1 }
      } else break
    }
    if (cells.length < 2) continue

    // The display year is the piped label of the season link, e.g.
    // [[2018 Buffalo Bills season|2018]] — fall back to any 4-digit year.
    const year = Number(
      cells[0].match(/\|\s*(\d{4})\s*\]\]/)?.[1] ?? cells[0].match(/\b(19\d\d|20\d\d)\b/)?.[1]
    )
    if (!Number.isInteger(year) || year < SINCE) continue

    // Only the second column — later ones are playoff starters or references.
    const qbs = parseQuarterbacks(cells[1])
    if (qbs.length) seasons[year] = qbs
  }
  return seasons
}

const IS_POSTSEASON = /post-?season|playoff/i

function parseHistory(wikitext) {
  const scored = extractTables(wikitext)
    .filter(t => !IS_POSTSEASON.test(t.heading))
    .map(t => {
      const seasons = parseSeasonTable(t.body)
      const score = Object.values(seasons).filter(qbs => qbs.some(q => q.starts != null || q.record)).length
      return { seasons, score }
    })
    .filter(t => t.score > 0)
    .sort((a, b) => a.score - b.score)

  // Merge lowest-scoring first so the richest table wins any season both cover.
  const merged = {}
  for (const { seasons } of scored) Object.assign(merged, seasons)
  return merged
}

const titleFor = name => `List of ${name} starting quarterbacks`
const entries = Object.entries(NFL_TEAMS)
const articles = await fetchArticles(entries.map(([name]) => titleFor(name)))

const history = {}
const problems = []
for (const [name, team] of entries) {
  const wikitext = articles[titleFor(name)]
  if (!wikitext) { problems.push(`${team.abbr}: article not returned (${titleFor(name)})`); continue }

  const seasons = parseHistory(wikitext)
  const years = Object.keys(seasons).map(Number)
  if (!years.length) { problems.push(`${team.abbr}: no seasons >= ${SINCE} parsed`); continue }

  history[team.abbr] = seasons
  console.error(`${team.abbr.padEnd(4)} ${years.length} seasons (${Math.min(...years)}-${Math.max(...years)})`)
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  problems.forEach(p => console.error('  ' + p))
}

const target = new URL('../src/data/nflQuarterbacks.js', import.meta.url)
const current = readFileSync(target, 'utf8')
const START = '// --- generated:start ---'
const END = '// --- generated:end ---'
if (!current.includes(START) || !current.includes(END)) {
  console.error('error: generated markers missing from src/data/nflQuarterbacks.js')
  process.exit(1)
}
const before = current.slice(0, current.indexOf(START))
const after = current.slice(current.indexOf(END) + END.length)
writeFileSync(target, `${before}${START}\nexport const QB_HISTORY = ${JSON.stringify(history, null, 2)}\n${END}${after}`)
console.error(`\nwrote ${Object.keys(history).length} teams to src/data/nflQuarterbacks.js`)
