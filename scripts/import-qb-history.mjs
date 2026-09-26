#!/usr/bin/env node
// Convert a CSV export of the quarterback-history sheet into
// src/data/nflQuarterbacks.js.
//
//   node scripts/import-qb-history.mjs <export.csv>
//
// Expected columns: Team, Zone, then one column per season (newest first).
// Cell format is `Name(starts)`, several quarterbacks separated by `/`, and
// `-` for a season with no entry. `Name(2-8)` is read as a win-loss record
// rather than a start count. Trailing `*` and `[I]` markers are dropped.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { NFL_TEAMS } from '../src/constants/nflTeams.js'

const START_YEAR = 2016

function parseCSV(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

// `Josh Allen(11) / Nathan Peterman(5)` -> [{ name, starts }, ...]
function parseCell(cell) {
  const text = (cell ?? '').trim()
  if (!text || text === '-' || text === '—') return []

  const clean = n => n.replace(/\[[^\]]*\]/g, '').replace(/\*/g, '').trim()
  return text.split('/').map(part => {
    const p = part.trim()
    const record = p.match(/^(.*?)\s*\((\d+)\s*[–-]\s*(\d+)\)/)
    if (record) return { name: clean(record[1]), record: `${record[2]}-${record[3]}` }
    const starts = p.match(/^(.*?)\s*\((\d+)\)/)
    if (starts) return { name: clean(starts[1]), starts: Number(starts[2]) }
    return { name: clean(p) }
  }).filter(q => q.name)
}

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('usage: node scripts/import-qb-history.mjs <export.csv>')
  console.error('  export the quarterback sheet as CSV first (File > Download > CSV)')
  process.exit(1)
}
if (!existsSync(csvPath)) {
  console.error(`error: no such file: ${csvPath}`)
  console.error('  pass the path to your own CSV export, not the placeholder name')
  process.exit(1)
}

const rows = parseCSV(readFileSync(csvPath, 'utf8')).filter(r => r.some(c => c.trim()))
if (!rows.length) {
  console.error(`error: ${csvPath} is empty`)
  process.exit(1)
}
const [header, ...body] = rows

const byName = Object.fromEntries(Object.entries(NFL_TEAMS).map(([name, t]) => [name, t.abbr]))
const seasonCols = header
  .map((h, i) => ({ year: Number(String(h).trim()), i }))
  .filter(c => Number.isInteger(c.year) && c.year >= START_YEAR)

const history = {}
const unmatched = []
for (const row of body) {
  const teamName = (row[0] ?? '').trim()
  const abbr = byName[teamName]
  if (!abbr) { if (teamName) unmatched.push(teamName); continue }

  const seasons = {}
  for (const { year, i } of seasonCols) {
    const qbs = parseCell(row[i])
    if (qbs.length) seasons[year] = qbs
  }
  if (Object.keys(seasons).length) history[abbr] = seasons
}

if (unmatched.length) {
  console.error(`warning: ${unmatched.length} unmatched team name(s): ${unmatched.join(', ')}`)
}
console.error(`imported ${Object.keys(history).length} teams, seasons ${seasonCols.map(c => c.year).join(', ')}`)

const target = new URL('../src/data/nflQuarterbacks.js', import.meta.url)
const current = readFileSync(target, 'utf8')

const START = '// --- generated:start ---'
const END = '// --- generated:end ---'
if (!current.includes(START) || !current.includes(END)) {
  console.error(`error: generated markers missing from ${target.pathname}`)
  process.exit(1)
}

// Rewrite only the marked region, so the schema notes above it survive and a
// re-import replaces previously generated data instead of appending to it.
const before = current.slice(0, current.indexOf(START))
const after = current.slice(current.indexOf(END) + END.length)
const generated = `export const QB_HISTORY = ${JSON.stringify(history, null, 2)}`

writeFileSync(target, `${before}${START}\n${generated}\n${END}${after}`)
console.error(`wrote ${target.pathname}`)
