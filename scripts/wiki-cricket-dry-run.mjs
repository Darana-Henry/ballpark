// Dry run of the Wikipedia cricket reader against live Wikipedia.
// Usage: node scripts/wiki-cricket-dry-run.mjs [year] [--json out.json]
import { writeFileSync } from 'node:fs'
import { fetchWikiCricketGames } from '../src/api/wikiCricket.js'

const args = process.argv.slice(2)
const year = parseInt(args.find(a => /^\d{4}$/.test(a))) || new Date().getFullYear()
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null

const t0 = Date.now()
const { games, seasons, articlesFetched } = await fetchWikiCricketGames({ year })
const inYear = games.filter(g => g.seriesStart.getUTCFullYear() === year)

console.log(`Seasons read: ${seasons.join(', ')} · tour articles fetched: ${articlesFetched} · ${Date.now() - t0}ms`)
console.log(`${inYear.length} matches in series starting in ${year}\n`)

const tours = new Map()
for (const g of [...inYear].reverse()) {
  if (!tours.has(g.seriesLabel)) tours.set(g.seriesLabel, [])
  tours.get(g.seriesLabel).push(g)
}
for (const [label, list] of tours) {
  const finals = list.filter(g => g.status === 'final')
  const missingScores = finals.filter(g => !g.homeScoreStr && !g.awayScoreStr && !/abandoned|no result/i.test(g.statusDetail))
  console.log(`■ ${label}  —  ${finals.length}/${list.length} finished${missingScores.length ? `  ⚠ ${missingScores.length} finished without scores` : ''}`)
  for (const g of list) {
    const d = g.gameDate.toISOString().slice(0, 10)
    const score = g.status === 'final'
      ? `${g.homeTeam.abbreviation} ${g.homeScoreStr ?? '–'} · ${g.awayTeam.abbreviation} ${g.awayScoreStr ?? '–'} → ${g.statusDetail}${g.difficulty ? ` [${g.difficulty.label}]` : ''}`
      : `${g.homeTeam.abbreviation} v ${g.awayTeam.abbreviation}  ${g.dateRange ?? ''} scheduled`
    console.log(`   ${d}  ${(g.matchNumber ?? '').padEnd(10)} ${g.gameType.padEnd(18)} ${score}`)
  }
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(games, null, 2))
  console.log(`\nWrote ${games.length} games to ${jsonOut}`)
}
