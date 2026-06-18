import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchNFLGames, fetchNFLStatsFromWatchedGames } from '../api/espn'
import GameCard from '../components/GameCard'
import SeasonStatsPanel from '../components/SeasonStatsPanel'
import SeasonFilter from '../components/SeasonFilter'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useWatched } from '../contexts/WatchedContext'
import { getSeasonYear, getAvailableSeasons } from '../utils/season'

// ─── NFL team map: name → { abbr, div, logo } ────────────────────────────────

const NFL_TEAMS = {
  'Buffalo Bills':          { abbr: 'BUF', div: 'AFC East'  },
  'Miami Dolphins':         { abbr: 'MIA', div: 'AFC East'  },
  'New England Patriots':   { abbr: 'NE',  div: 'AFC East'  },
  'New York Jets':          { abbr: 'NYJ', div: 'AFC East'  },
  'Baltimore Ravens':       { abbr: 'BAL', div: 'AFC North' },
  'Cincinnati Bengals':     { abbr: 'CIN', div: 'AFC North' },
  'Cleveland Browns':       { abbr: 'CLE', div: 'AFC North' },
  'Pittsburgh Steelers':    { abbr: 'PIT', div: 'AFC North' },
  'Houston Texans':         { abbr: 'HOU', div: 'AFC South' },
  'Indianapolis Colts':     { abbr: 'IND', div: 'AFC South' },
  'Jacksonville Jaguars':   { abbr: 'JAX', div: 'AFC South' },
  'Tennessee Titans':       { abbr: 'TEN', div: 'AFC South' },
  'Denver Broncos':         { abbr: 'DEN', div: 'AFC West'  },
  'Kansas City Chiefs':     { abbr: 'KC',  div: 'AFC West'  },
  'Las Vegas Raiders':      { abbr: 'LV',  div: 'AFC West'  },
  'Los Angeles Chargers':   { abbr: 'LAC', div: 'AFC West'  },
  'Dallas Cowboys':         { abbr: 'DAL', div: 'NFC East'  },
  'New York Giants':        { abbr: 'NYG', div: 'NFC East'  },
  'Philadelphia Eagles':    { abbr: 'PHI', div: 'NFC East'  },
  'Washington Commanders':  { abbr: 'WAS', div: 'NFC East'  },
  'Chicago Bears':          { abbr: 'CHI', div: 'NFC North' },
  'Detroit Lions':          { abbr: 'DET', div: 'NFC North' },
  'Green Bay Packers':      { abbr: 'GB',  div: 'NFC North' },
  'Minnesota Vikings':      { abbr: 'MIN', div: 'NFC North' },
  'Atlanta Falcons':        { abbr: 'ATL', div: 'NFC South' },
  'Carolina Panthers':      { abbr: 'CAR', div: 'NFC South' },
  'New Orleans Saints':     { abbr: 'NO',  div: 'NFC South' },
  'Tampa Bay Buccaneers':   { abbr: 'TB',  div: 'NFC South' },
  'Arizona Cardinals':      { abbr: 'ARI', div: 'NFC West'  },
  'Los Angeles Rams':       { abbr: 'LAR', div: 'NFC West'  },
  'Seattle Seahawks':       { abbr: 'SEA', div: 'NFC West'  },
  'San Francisco 49ers':    { abbr: 'SF',  div: 'NFC West'  },
}

const NFL_DIVISION_ORDER = [
  'AFC East', 'AFC North', 'AFC South', 'AFC West',
  'NFC East', 'NFC North', 'NFC South', 'NFC West',
]

function nflLogo(abbr) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`
}

function getNFLPlayoffRound(gameType, gameDate) {
  if (!gameType || gameType === 'Regular Season') return null
  const gt = gameType.toLowerCase()
  if (gt.includes('super bowl')) return 'Super Bowl'
  if (gt.includes('championship')) return 'Conference'
  if (gt.includes('divisional') || gt.includes('division')) return 'Divisional'
  if (gt.includes('wild card')) return 'Wild Card'
  // Date-based fallback when gameType is generic 'Playoffs'
  if (gameDate) {
    const d = new Date(gameDate)
    const m = d.getMonth(), day = d.getDate()
    if (m === 1) return 'Super Bowl'           // February
    if (m === 0 && day >= 24) return 'Conference'
    if (m === 0 && day >= 16) return 'Divisional'
    if (m === 0) return 'Wild Card'
  }
  return 'Wild Card'
}

function getConference(teamName) {
  return NFL_TEAMS[teamName]?.div.startsWith('AFC') ? 'AFC' : 'NFC'
}

function NFLBracketGame({ game, isProcessed }) {
  const processed = game && isProcessed(game.id) && game.status === 'final'
  const homeWon = processed && game.homeScore > game.awayScore
  const awayWon = processed && game.awayScore > game.homeScore

  if (!game) {
    return (
      <div className="rounded-lg border border-slate-700/40 overflow-hidden min-w-[110px]">
        {[0, 1].map(i => (
          <div key={i}>
            {i > 0 && <div className="h-px bg-slate-800" />}
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <div className="w-3.5 h-3.5 rounded-full bg-slate-800 shrink-0" />
              <span className="text-[11px] text-slate-600">TBD</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`rounded-lg border overflow-hidden min-w-[110px] ${processed ? 'border-slate-600/60' : 'border-slate-700/60'}`}>
      {[
        { team: game.awayTeam, won: awayWon, score: game.awayScore },
        { team: game.homeTeam, won: homeWon, score: game.homeScore },
      ].map(({ team, won, score }, i) => {
        const info = NFL_TEAMS[team.name]
        return (
          <div key={team.id}>
            {i > 0 && <div className="h-px bg-slate-800" />}
            <div className={`flex items-center gap-1.5 px-2 py-1.5 ${won ? 'bg-green-950/30' : ''}`}>
              <NFLTeamLogo abbr={info?.abbr || team.abbreviation} size={14} />
              <span className={`text-[11px] font-medium flex-1 max-w-[66px] truncate ${won ? 'text-green-400' : 'text-slate-300'}`}>
                {team.name.split(' ').pop()}
              </span>
              {processed && (
                <span className={`text-[10px] font-bold tabular-nums shrink-0 ${won ? 'text-green-400' : 'text-slate-500'}`}>{score}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const NFL_ROUND_ORDER = ['Wild Card', 'Divisional', 'Conference', 'Super Bowl']

function NFLPlayoffBracket({ games, isProcessed }) {
  const playoffGames = useMemo(() => {
    const rounds = { 'Wild Card': [], 'Divisional': [], 'Conference': [], 'Super Bowl': [] }
    for (const g of games) {
      const round = getNFLPlayoffRound(g.gameType, g.gameDate)
      if (round && rounds[round]) rounds[round].push(g)
    }
    return rounds
  }, [games])

  const hasAny = NFL_ROUND_ORDER.some(r => playoffGames[r].length > 0)
  if (!hasAny) return <p className="text-xs text-slate-600">No playoff games found yet.</p>

  // Split Wild Card / Divisional / Conference by conference
  const splitByConf = (roundGames) => {
    const afc = [], nfc = []
    for (const g of roundGames) {
      const homeConf = getConference(g.homeTeam.name)
      const awayConf = getConference(g.awayTeam.name)
      const conf = homeConf === awayConf ? homeConf : 'Super Bowl'
      if (conf === 'AFC') afc.push(g)
      else if (conf === 'NFC') nfc.push(g)
    }
    return { afc, nfc }
  }

  const wcSplit   = splitByConf(playoffGames['Wild Card'])
  const divSplit  = splitByConf(playoffGames['Divisional'])
  const confSplit = splitByConf(playoffGames['Conference'])
  const sbGames   = playoffGames['Super Bowl']

  const RoundColumn = ({ label, games: colGames }) => (
    <div className="flex flex-col gap-2 shrink-0">
      <p className="text-[9px] text-slate-600 uppercase tracking-widest">{label}</p>
      {colGames.length > 0
        ? colGames.map(g => <NFLBracketGame key={g.id} game={g} isProcessed={isProcessed} />)
        : <NFLBracketGame game={null} isProcessed={isProcessed} />
      }
    </div>
  )

  const hasWildCard   = wcSplit.afc.length > 0 || wcSplit.nfc.length > 0
  const hasDivisional = divSplit.afc.length > 0 || divSplit.nfc.length > 0
  const hasConf       = confSplit.afc.length > 0 || confSplit.nfc.length > 0

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f0f1a] p-4">
      <p className="text-xs font-semibold text-slate-300 mb-4">NFL Playoffs</p>

      {['AFC', 'NFC'].map(conf => {
        const wc   = conf === 'AFC' ? wcSplit.afc   : wcSplit.nfc
        const div  = conf === 'AFC' ? divSplit.afc  : divSplit.nfc
        const cfm  = conf === 'AFC' ? confSplit.afc : confSplit.nfc
        const show = wc.length > 0 || div.length > 0 || cfm.length > 0
        if (!show) return null
        return (
          <div key={conf} className="mb-5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">{conf}</p>
            <div className="flex items-start gap-3 overflow-x-auto pb-1">
              {hasWildCard   && <RoundColumn label="Wild Card"   games={wc} />}
              {hasWildCard   && <div className="text-slate-700 mt-6 shrink-0">›</div>}
              {hasDivisional && <RoundColumn label="Divisional"  games={div} />}
              {hasDivisional && <div className="text-slate-700 mt-6 shrink-0">›</div>}
              {hasConf       && <RoundColumn label="Conference"  games={cfm} />}
            </div>
          </div>
        )
      })}

      {sbGames.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Super Bowl</p>
          <div className="flex gap-3">
            {sbGames.map(g => <NFLBracketGame key={g.id} game={g} isProcessed={isProcessed} />)}
          </div>
        </div>
      )}

      <p className="text-[9px] text-slate-700 mt-3">Updates as you watch or skip playoff games</p>
    </div>
  )
}

// ─── My Queue ─────────────────────────────────────────────────────────────────

function QueueTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showWatched, setShowWatched] = useState(false)

  const { upNext, nextScheduled, unwatched, watched } = useMemo(() => {
    const live = games.filter(g => g.status === 'live' && !isDismissed(g.id, 'nfl'))
    const finalUnwatched = games
      .filter(g => g.status === 'final' && !isWatched(g.id, 'nfl') && !isDismissed(g.id, 'nfl'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const scheduled = games
      .filter(g => g.status === 'scheduled' && !isDismissed(g.id, 'nfl'))
      .sort((a, b) => a.gameDate - b.gameDate)
    const watchedList = games
      .filter(g => isWatched(g.id, 'nfl'))
      .sort((a, b) => b.gameDate - a.gameDate)

    const upNext = finalUnwatched[0] ?? live[0] ?? scheduled[0]
    const upNextId = upNext?.id
    const remaining = [
      ...finalUnwatched.filter(g => g.id !== upNextId),
      ...live.filter(g => g.id !== upNextId),
      ...scheduled.filter(g => g.id !== upNextId),
    ]
    return { upNext, nextScheduled: scheduled[0] ?? null, unwatched: remaining, watched: watchedList }
  }, [games, isWatched, isDismissed])


  return (
    <div className="flex flex-col gap-3">
      {!upNext && unwatched.length === 0 && watched.length === 0 && (
        <EmptyState emoji="🏈" title="No games yet" message="Check back when the season starts." />
      )}

      {upNext && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Up Next For You</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameCard game={upNext} isUpNext showDismissAction />
            <SeasonStatsPanel league="nfl" trackedTeamId={null} />
          </div>
        </>
      )}

      {unwatched.length > 0 && upNext && (
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 border-t border-white/[0.07]" />
          <span className="text-xs text-slate-600 shrink-0">{unwatched.length} more upcoming</span>
          <div className="flex-1 border-t border-white/[0.07]" />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {unwatched.map(g => <GameCard key={g.id} game={g} showDismissAction />)}
      </div>

      {watched.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowWatched(v => !v)}
            className="w-full flex items-center gap-3 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <div className="flex-1 border-t border-slate-800" />
            <span className="shrink-0 flex items-center gap-1.5">
              {showWatched ? '▾' : '▸'} {watched.length} watched
            </span>
            <div className="flex-1 border-t border-slate-800" />
          </button>
          {showWatched && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {watched.map(g => <GameCard key={g.id} game={g} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── All Games ────────────────────────────────────────────────────────────────

const GAME_FILTERS = [
  { id: 'all',      label: 'All'            },
  { id: 'playoffs', label: 'Playoffs'       },
  { id: 'regular',  label: 'Regular Season' },
]

function AllGamesTab({ games }) {
  const [filter, setFilter] = useState('all')
  const filtered = useMemo(() => {
    const sorted = [...games].sort((a, b) => b.gameDate - a.gameDate)
    if (filter === 'playoffs') return sorted.filter(g => g.gameType !== 'Regular Season')
    if (filter === 'regular')  return sorted.filter(g => g.gameType === 'Regular Season')
    return sorted
  }, [games, filter])

  return (
    <>
      <div className="flex gap-1 mb-4 bg-slate-900 rounded-xl p-1 w-fit">
        {GAME_FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.id ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map(g => <GameCard key={g.id} game={g} />)}
      </div>
    </>
  )
}

// ─── Watched ──────────────────────────────────────────────────────────────────

function WatchedTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const [showSkipped, setShowSkipped] = useState(false)

  const watched = games
    .filter(g => isWatched(g.id, 'nfl'))
    .sort((a, b) => b.gameDate - a.gameDate)

  const skipped = games
    .filter(g => isDismissed(g.id, 'nfl'))
    .sort((a, b) => b.gameDate - a.gameDate)

  if (watched.length === 0 && skipped.length === 0) {
    return (
      <EmptyState emoji="🏈" title="No watched games yet"
        message="Mark games as watched from My Queue — they'll appear here so you can review or unwatch them." />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {watched.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-2 bg-slate-900 rounded-xl px-4 py-2">
              <span className="text-emerald-400 font-bold text-lg">{watched.length}</span>
              <span className="text-slate-600 text-sm">game{watched.length !== 1 ? 's' : ''} watched</span>
            </div>
            <p className="text-xs text-slate-600">scores visible · toggle to unwatch</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {watched.map(g => <GameCard key={g.id} game={g} />)}
          </div>
        </>
      )}

      {skipped.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowSkipped(v => !v)}
            className="w-full flex items-center gap-3 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            <div className="flex-1 border-t border-slate-800" />
            <span className="shrink-0 flex items-center gap-1.5">
              {showSkipped ? '▾' : '▸'} {skipped.length} skipped
            </span>
            <div className="flex-1 border-t border-slate-800" />
          </button>
          {showSkipped && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
              {skipped.map(g => <GameCard key={g.id} game={g} showDismissAction />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Standings ────────────────────────────────────────────────────────────────

function NFLTeamLogo({ abbr, size = 20 }) {
  const [err, setErr] = useState(false)
  if (err) {
    return (
      <div className="rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-400 shrink-0"
        style={{ width: size, height: size }}>
        {abbr?.slice(0, 3)}
      </div>
    )
  }
  return (
    <img src={nflLogo(abbr)} alt={abbr} width={size} height={size}
      className="rounded-full object-contain bg-slate-800/50 p-0.5 shrink-0"
      onError={() => setErr(true)} />
  )
}

function DivisionTable({ divName, teams, records }) {
  const sorted = [...teams].sort((a, b) => {
    const ra = records[a] || { w: 0, l: 0, t: 0 }
    const rb = records[b] || { w: 0, l: 0, t: 0 }
    const pctA = ra.w / Math.max(1, ra.w + ra.l + ra.t)
    const pctB = rb.w / Math.max(1, rb.w + rb.l + rb.t)
    return pctB - pctA
  })

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="bg-slate-900 px-3 py-2 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-400">{divName}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-slate-900/40 text-[10px] text-slate-600 uppercase tracking-wide">
            <th className="text-left px-3 py-1.5 font-medium">Team</th>
            <th className="px-2 py-1.5 font-medium text-right">W</th>
            <th className="px-2 py-1.5 font-medium text-right">L</th>
            <th className="px-3 py-1.5 font-medium text-right">T</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((teamName, i) => {
            const info = NFL_TEAMS[teamName]
            const rec = records[teamName] || { w: 0, l: 0, t: 0 }
            const hasGames = rec.w > 0 || rec.l > 0 || rec.t > 0
            return (
              <tr key={teamName}
                className={`border-t border-slate-800/60 ${i % 2 === 0 ? 'bg-[#161622]' : 'bg-[#131320]'}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <NFLTeamLogo abbr={info?.abbr || teamName.slice(0,3)} size={20} />
                    <span className="text-xs font-medium text-slate-300">
                      {teamName.split(' ').pop()}
                    </span>
                  </div>
                </td>
                <td className={`px-2 py-2 text-right text-xs font-bold tabular-nums ${!hasGames ? 'text-slate-700' : 'text-green-400'}`}>{rec.w}</td>
                <td className={`px-2 py-2 text-right text-xs tabular-nums ${!hasGames ? 'text-slate-700' : 'text-slate-400'}`}>{rec.l}</td>
                <td className={`px-3 py-2 text-right text-xs tabular-nums ${!hasGames ? 'text-slate-700' : 'text-slate-500'}`}>{rec.t}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StandingsTab() {
  const { watchedGames } = useWatched()
  const [seasonFilter, setSeasonFilter] = useState('all')

  const availableSeasons = useMemo(
    () => getAvailableSeasons(watchedGames, 'nfl'),
    [watchedGames]
  )

  const records = useMemo(() => {
    const map = {}
    Object.values(watchedGames).forEach(g => {
      if (g.league !== 'nfl' || !g.watched) return
      if (g.homeScore === null || g.awayScore === null) return
      if (seasonFilter !== 'all' && getSeasonYear('nfl', g.gameDate) !== seasonFilter) return
      const home = g.homeTeam
      const away = g.awayTeam
      if (!map[home]) map[home] = { w: 0, l: 0, t: 0 }
      if (!map[away]) map[away] = { w: 0, l: 0, t: 0 }
      if (g.homeScore > g.awayScore)      { map[home].w++; map[away].l++ }
      else if (g.awayScore > g.homeScore) { map[away].w++; map[home].l++ }
      else                                { map[home].t++; map[away].t++ }
    })
    return map
  }, [watchedGames, seasonFilter])

  const totalWatched = Object.values(watchedGames).filter(g => g.league === 'nfl' && g.watched).length

  const divisionTeams = useMemo(() => {
    const divMap = {}
    for (const [name, info] of Object.entries(NFL_TEAMS)) {
      if (!divMap[info.div]) divMap[info.div] = []
      divMap[info.div].push(name)
    }
    return divMap
  }, [])

  const afcDivisions = NFL_DIVISION_ORDER.filter(d => d.startsWith('AFC'))
  const nfcDivisions = NFL_DIVISION_ORDER.filter(d => d.startsWith('NFC'))

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SeasonFilter league="nfl" seasons={availableSeasons} selected={seasonFilter} onChange={setSeasonFilter} />
        <p className="text-xs text-slate-500">
          Computed from <span className="text-slate-300 font-medium">{totalWatched}</span> watched game{totalWatched !== 1 ? 's' : ''} · updates as you mark games
        </p>
      </div>

      {[{ label: 'AFC', divisions: afcDivisions }, { label: 'NFC', divisions: nfcDivisions }].map(({ label, divisions }) => (
        <section key={label}>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{label}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {divisions.map(div => (
              <DivisionTable
                key={div}
                divName={div}
                teams={divisionTeams[div] || []}
                records={records}
              />
            ))}
          </div>
        </section>
      ))}

    </div>
  )
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function NFLLeaderboard({ title, players, valueKey, unit = '' }) {
  if (!players?.length) return null
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest shrink-0">{title}</h3>
        <div className="flex-1 border-t border-slate-800" />
      </div>
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        {players.map((p, i) => (
          <div key={p.id}
            className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-slate-800/60' : ''} ${i % 2 === 0 ? 'bg-[#161622]' : 'bg-[#131320]'}`}>
            <span className={`text-xs font-bold tabular-nums w-4 shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-600'}`}>
              {i + 1}
            </span>
            {p.photo
              ? <img src={p.photo} alt={p.name} width={28} height={28} className="rounded-full object-cover object-top bg-slate-800 shrink-0" />
              : <div className="w-7 h-7 rounded-full bg-slate-700 shrink-0" />
            }
            <span className="text-sm font-medium text-slate-200 flex-1 truncate">{p.name}</span>
            <span className="text-xs text-slate-500 shrink-0">{p.team}</span>
            <span className="text-sm font-bold tabular-nums text-slate-100 shrink-0 ml-2">
              {p[valueKey].toLocaleString()}{unit}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function StatsTab() {
  const { watchedGames } = useWatched()
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [seasonFilter, setSeasonFilter] = useState('all')

  const nflWatched = useMemo(
    () => Object.values(watchedGames).filter(g => g.league === 'nfl' && g.watched),
    [watchedGames]
  )

  const availableSeasons = useMemo(
    () => getAvailableSeasons(watchedGames, 'nfl'),
    [watchedGames]
  )

  const filteredWatched = useMemo(
    () => seasonFilter === 'all'
      ? nflWatched
      : nflWatched.filter(g => getSeasonYear('nfl', g.gameDate) === seasonFilter),
    [nflWatched, seasonFilter]
  )

  useEffect(() => {
    if (!filteredWatched.length) { setStats(null); return }
    setLoading(true)
    setError(null)
    fetchNFLStatsFromWatchedGames(filteredWatched)
      .then(setStats)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [filteredWatched.length, seasonFilter])

  if (!nflWatched.length) return (
    <EmptyState emoji="📊" title="No watched games yet"
      message="Mark games as watched in My Queue — stats will be computed from those games." />
  )

  if (loading) return <LoadingSpinner message={`Fetching stats from ${filteredWatched.length} watched game${filteredWatched.length !== 1 ? 's' : ''}…`} />

  if (error) return (
    <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">
      Failed to load stats: {error}
    </div>
  )

  if (!stats) return null

  return (
    <div className="flex flex-col gap-6">
      <SeasonFilter league="nfl" seasons={availableSeasons} selected={seasonFilter} onChange={setSeasonFilter} />
      <p className="text-xs text-slate-500">
        Stats from <span className="text-slate-300 font-medium">{stats.gameCount}</span> watched game{stats.gameCount !== 1 ? 's' : ''} · top 7 across all teams · totals
      </p>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <NFLLeaderboard title="Passing Yards"   players={stats.passingYds}   valueKey="yds" unit=" yds" />
        <NFLLeaderboard title="Passing TDs"     players={stats.passingTds}   valueKey="tds" unit=" TD"  />
        <NFLLeaderboard title="Rushing Yards"   players={stats.rushingYds}   valueKey="yds" unit=" yds" />
        <NFLLeaderboard title="Rushing TDs"     players={stats.rushingTds}   valueKey="tds" unit=" TD"  />
        <NFLLeaderboard title="Receiving Yards" players={stats.receivingYds} valueKey="yds" unit=" yds" />
        <NFLLeaderboard title="Receiving TDs"   players={stats.receivingTds} valueKey="tds" unit=" TD"  />
      </div>
    </div>
  )
}

// ─── Playoffs ─────────────────────────────────────────────────────────────────

function NFLBracketTab({ games }) {
  const { isWatched, isDismissed } = useWatched()
  const isProcessed = useCallback(
    id => isWatched(id, 'nfl') || isDismissed(id, 'nfl'),
    [isWatched, isDismissed]
  )
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">Bracket updates as you watch or skip playoff games</p>
      <NFLPlayoffBracket games={games} isProcessed={isProcessed} />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'queue',     label: 'My Queue'  },
  { id: 'all',       label: 'All Games' },
  { id: 'watched',   label: 'Watched'   },
  { id: 'standings', label: 'Standings' },
  { id: 'playoffs',  label: 'Playoffs'  },
  { id: 'stats',     label: 'Stats'     },
]

export default function NFLView() {
  const [games, setGames]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [tab, setTab]         = useState('queue')

  useEffect(() => {
    fetchNFLGames()
      .then(setGames)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-4 mb-7">
        <img
          src="https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png"
          alt="NFL"
          width={72} height={72}
          className="rounded-full object-contain bg-emerald-950/40 border border-emerald-900/40 p-1.5 shrink-0"
        />
        <div>
          <h2 className="text-2xl font-bold text-slate-100 leading-tight">NFL</h2>
          <p className="text-sm text-slate-500 mt-0.5">All teams · regular season + all playoffs</p>
        </div>
      </div>

      <div className="flex mb-6 rounded-2xl p-1 overflow-x-auto gap-0.5" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            style={tab === t.id ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}>
            {t.label}
            {tab === t.id && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-blue-500 rounded-full" />}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner message="Loading NFL season (fetching all 23 weeks)…" />}
      {error && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-4 text-red-400 text-sm">
          Failed to load: {error}
        </div>
      )}

      {!loading && !error && tab === 'queue'     && <QueueTab games={games} />}
      {!loading && !error && tab === 'all'       && <AllGamesTab games={games} />}
      {!loading && !error && tab === 'watched'   && <WatchedTab games={games} />}
      {tab === 'standings' && <StandingsTab games={games} />}
      {tab === 'playoffs'  && <NFLBracketTab games={games} />}
      {tab === 'stats'     && <StatsTab />}
    </div>
  )
}
