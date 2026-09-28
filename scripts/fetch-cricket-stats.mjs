// Fetches the year's international cricket leaderboards from ESPNcricinfo
// Statsguru and writes them to src/data/cricketLeaders.json, which the
// Cricket tab's Leaders view imports. Statsguru can't be read from the
// browser (no cross-origin access), so this runs at deploy time instead.
//
// Counts players of the 12 nations the Cricket tab tracks (Statsguru's team
// filter), in all their matches — against any opponent, Namibia and Japan
// included — across all series types.
//
// Usage: node scripts/fetch-cricket-stats.mjs [year]
// On failure the existing JSON is left untouched and the script exits 0, so a
// Cricinfo outage never blocks a deploy — the Leaders view just shows the
// date of the last successful fetch.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../src/data/cricketLeaders.json', import.meta.url))
const YEAR = parseInt(process.argv[2]) || new Date().getFullYear()
const TOP = 5

// Statsguru team ids: ENG AUS SA WI NZ IND PAK SL ZIM BAN IRE AFG
const TEAM_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 25, 29, 40]
const FORMATS = { test: 1, odi: 2, t20i: 3 }

const TABLES = {
  runs:    { type: 'batting', extra: 'orderby=runs' },
  wickets: { type: 'bowling', extra: 'orderby=wickets' },
  innings: { type: 'batting', extra: 'view=innings;orderby=runs' },
  bowling: { type: 'bowling', extra: 'view=innings;orderby=wickets' },
}

function statsguruUrl(formatClass, { type, extra }) {
  const teams = TEAM_IDS.map(id => `team=${id}`).join(';')
  return 'https://stats.espncricinfo.com/ci/engine/stats/index.html?' + [
    `class=${formatClass}`, `spanmin1=01+Jan+${YEAR}`, `spanmax1=31+Dec+${YEAR}`, 'spanval1=span',
    'template=results', `type=${type}`, teams, extra,
  ].join(';')
}

const decode = s => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .trim()

// Returns the results table as objects keyed by column header. Statsguru
// pages carry several tables; the results one follows a caption naming the
// view ("Overall figures" for totals, "Innings by innings list" for single
// innings).
async function fetchTable(url, caption) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36' } })
  if (!res.ok) throw new Error(`Statsguru HTTP ${res.status}`)
  const html = await res.text()
  const start = html.indexOf(caption)
  if (start < 0) throw new Error('Statsguru results table not found')
  const table = html.slice(start, html.indexOf('</table>', start))
  const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => decode(m[1]))
  return [...table.matchAll(/<tr class="data1">([\s\S]*?)<\/tr>/g)].map(row => {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => decode(m[1]))
    return Object.fromEntries(headers.map((h, i) => [h || `_${i}`, cells[i] ?? '']))
  })
}

// "Mohammad Nawaz (3) (PAK)" → { name: 'Mohammad Nawaz', team: 'PAK' }
// (the "(3)" is Statsguru's disambiguation between same-named players)
function splitPlayer(raw) {
  const m = raw.match(/^(.*?)\s*(?:\(\d+\)\s*)?\(([^)]+)\)$/)
  return m ? { name: m[1], team: m[2] } : { name: raw, team: '' }
}

const num = s => (s === '' || s === '-' ? null : Number(s))

const SHAPE = {
  runs: r => ({ ...splitPlayer(r.Player), matches: num(r.Mat), runs: num(r.Runs), average: num(r.Ave) }),
  wickets: r => ({ ...splitPlayer(r.Player), matches: num(r.Mat), wickets: num(r.Wkts), strikeRate: num(r.SR) }),
  innings: r => ({ ...splitPlayer(r.Player), score: r.Runs, balls: num(r.BF), opposition: r.Opposition.replace(/^v /, ''), date: r['Start Date'] }),
  bowling: r => ({ ...splitPlayer(r.Player), figures: `${r.Wkts}/${r.Runs}`, overs: r.Overs, opposition: r.Opposition.replace(/^v /, ''), date: r['Start Date'] }),
}

async function main() {
  const formats = {}
  for (const [format, cls] of Object.entries(FORMATS)) {
    formats[format] = {}
    for (const [table, spec] of Object.entries(TABLES)) {
      const caption = spec.extra.includes('view=innings') ? 'Innings by innings list' : 'Overall figures'
      const rows = await fetchTable(statsguruUrl(cls, spec), caption)
      formats[format][table] = rows.slice(0, TOP).map(SHAPE[table])
    }
  }
  // Nothing at all usually means Statsguru changed its page layout — don't
  // overwrite good data with an empty copy.
  if (Object.values(formats).every(f => Object.values(f).every(rows => rows.length === 0))) {
    throw new Error('every Statsguru table came back empty')
  }
  const data = { year: YEAR, source: 'ESPNcricinfo Statsguru', fetchedAt: new Date().toISOString(), formats }
  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n')
  console.log(`Cricket leaders for ${YEAR} written to src/data/cricketLeaders.json`)
}

main().catch(e => {
  let previous = 'none'
  try { previous = JSON.parse(readFileSync(OUT, 'utf8')).fetchedAt } catch { /* no previous file */ }
  console.warn(`⚠ Cricket leaders not updated (${e.message}) — keeping the previous copy (fetched ${previous}).`)
})
