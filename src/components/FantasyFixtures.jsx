import { useState, useMemo } from 'react'
import { useFantasyData, perLeague } from '../contexts/fantasyData'
import { leagueTable, nextRound, upcomingFixtures, DIFFICULTY } from '../utils/fantasyFixtures'
import Chip from './FilterChip'

const WINDOWS = [3, 5, 7]

const derive = perLeague(data => {
  const LAST_ROUND = data.rounds.at(-1) ?? 0
  // How many of the user's squad play for each team.
  const MINE = new Map()
  for (const pick of data.mySquad?.picks ?? []) {
    const team = data.players.find(p => p.id === pick.id)?.team
    if (team) MINE.set(team, (MINE.get(team) ?? 0) + 1)
  }
  return {
    TEAMS: Object.fromEntries(data.teams.map(t => [t.id, t])),
    LAST_ROUND,
    TABLE: leagueTable(data.fixtures, data.teams, LAST_ROUND),
    PREVIOUS: leagueTable(data.fixtures, data.teams, LAST_ROUND - 1),
    FROM_ROUND: nextRound(data.fixtures),
    MINE,
  }
})

function Movement({ team }) {
  const { TABLE, PREVIOUS, LAST_ROUND } = derive(useFantasyData().data)
  const now = TABLE.get(team)?.rank
  const before = PREVIOUS.get(team)?.rank
  if (!now || !before || now === before) return <span className="w-6" />
  const up = now < before
  return (
    <span className={`w-6 text-[10px] font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`} title={`#${before} before GW${LAST_ROUND}`}>
      {up ? '▲' : '▼'}{Math.abs(before - now)}
    </span>
  )
}

// One round for one team: nothing (blank), one opponent, or two (double).
// Also used for the players table's next-fixture columns.
export function FixtureCell({ games }) {
  const { TEAMS } = derive(useFantasyData().data)
  if (!games.length) return <td className="px-1 py-1.5"><div className="h-8 rounded-md bg-slate-900/60 text-slate-600 text-[11px] flex items-center justify-center">—</div></td>
  return (
    <td className="px-1 py-1.5">
      <div className="flex flex-col gap-0.5">
        {games.map((g, i) => (
          <div
            key={i}
            className={`rounded-md text-center font-semibold whitespace-nowrap ${games.length > 1 ? 'text-[10px] py-0.5' : 'text-xs h-8 flex items-center justify-center'} ${DIFFICULTY[g.difficulty].className}`}
            title={`${g.home ? 'Home' : 'Away'} vs ${TEAMS[g.opponent].name} · ${DIFFICULTY[g.difficulty].label} (${g.difficulty}) · they average ${g.strength.toFixed(2)} pts per game`}
          >
            {TEAMS[g.opponent].short} <span className="font-normal opacity-75">({g.home ? 'H' : 'A'})</span>
          </div>
        ))}
      </div>
    </td>
  )
}

export default function FantasyFixtures() {
  const { data } = useFantasyData()
  const { LAST_ROUND, FROM_ROUND, MINE } = derive(data)
  const [count, setCount] = useState(5)
  const [sort, setSort] = useState({ key: 'avg', desc: false })

  const { rounds, rows } = useMemo(() => {
    const { TABLE, FROM_ROUND } = derive(data)
    const { rounds, byTeam } = upcomingFixtures(data.fixtures, data.teams, FROM_ROUND, count)
    const rows = data.teams.map(t => {
      const games = byTeam.get(t.id).flat()
      return {
        team: t,
        rank: TABLE.get(t.id)?.rank,
        byRound: byTeam.get(t.id),
        games: games.length,
        avg: games.length ? games.reduce((sum, g) => sum + g.difficulty, 0) / games.length : Infinity,
      }
    })
    const dir = sort.desc ? -1 : 1
    // Easiest first; with equal ratings, more games is better.
    rows.sort((a, b) => dir * (a[sort.key] - b[sort.key]) || b.games - a.games || a.rank - b.rank)
    return { rounds, rows }
  }, [data, count, sort])

  if (!Number.isFinite(FROM_ROUND)) {
    return <p className="text-sm text-slate-500 text-center py-10">The season is over: no fixtures left to rate.</p>
  }

  const toggleSort = key => setSort(s => ({ key, desc: s.key === key ? !s.desc : false }))
  const sortHeader = (key, label, title) => (
    <button onClick={() => toggleSort(key)} title={title} className={sort.key === key ? 'text-indigo-300' : 'hover:text-slate-300'}>
      {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </button>
  )
  const uneven = rows.some(r => r.games !== rounds.length)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-slate-500">Next</span>
        <div className="flex gap-1">
          {WINDOWS.map(n => <Chip key={n} active={count === n} onClick={() => setCount(n)}>{n} rounds</Chip>)}
        </div>
        <div className="flex items-center gap-1 ml-auto text-[10px] text-slate-500">
          {Object.entries(DIFFICULTY).map(([n, d]) => (
            <span key={n} className={`px-1.5 py-0.5 rounded ${d.className}`} title={d.label}>{n}</span>
          ))}
          <span className="ml-1">easy → hard</span>
        </div>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
              <th className="sticky md:static z-10 left-0 w-14 min-w-14 bg-[#10101a] md:bg-transparent text-left font-semibold px-3 py-2.5 whitespace-nowrap">{sortHeader('rank', '#', `League position after GW${LAST_ROUND}`)}</th>
              <th className="sticky md:static z-10 left-14 bg-[#10101a] md:bg-transparent text-left font-semibold px-2 py-2.5">Team</th>
              {rounds.map(r => <th key={r} className="font-semibold px-1 py-2.5 min-w-[4.5rem]">GW{r}</th>)}
              <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap">{sortHeader('avg', 'Avg', 'Average difficulty over these rounds (1 easy, 5 hard)')}</th>
              {uneven && <th className="text-right font-semibold px-3 py-2.5">{sortHeader('games', 'Games', 'Matches in these rounds (blanks and doubles)')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const mine = MINE.get(r.team.id)
              const stickyBg = mine ? 'bg-[#141429] md:bg-transparent' : 'bg-[#10101a] md:bg-transparent'
              return (
                <tr key={r.team.id} className={`border-b border-white/5 ${mine ? 'bg-indigo-500/[0.07]' : ''}`}>
                  <td className={`sticky md:static z-10 left-0 w-14 min-w-14 ${stickyBg} px-3 py-1.5`}>
                    <span className="flex items-center gap-1 tabular-nums">
                      <span className="w-5 text-slate-300 font-semibold">{r.rank}</span>
                      <Movement team={r.team.id} />
                    </span>
                  </td>
                  <td className={`sticky md:static z-10 left-14 ${stickyBg} px-2 py-1.5`}>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="font-semibold text-slate-100">{r.team.name}</span>
                      {mine && <span className="text-[10px] font-semibold text-indigo-300" title={`${mine} of your players`}>×{mine}</span>}
                    </span>
                  </td>
                  {r.byRound.map((games, i) => <FixtureCell key={rounds[i]} games={games} />)}
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-200">{Number.isFinite(r.avg) ? r.avg.toFixed(1) : '–'}</td>
                  {uneven && <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{r.games}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-600 mt-2">
        Difficulty is the opponent's points per game, half over the season and half at that venue: 2.0+ is a 5, 1.6+ a 4, 1.2+ a 3, 0.9+ a 2.
      </p>
    </>
  )
}
