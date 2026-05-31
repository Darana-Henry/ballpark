import { useWatched } from '../contexts/WatchedContext'
import { LEAGUES, LEAGUE_MAP } from '../constants/leagues'
import { isFirebaseConfigured } from '../firebase'

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-[#161622] border border-slate-800 p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function LeagueStats({ league }) {
  const { watchedForLeague } = useWatched()
  const watched = watchedForLeague(league.id)

  const finalGames = watched.filter(g => g.status === 'final' && g.homeScore !== null && g.awayScore !== null)

  // Determine wins/losses based on the "home" team perspective isn't reliable
  // So track by the featured teams (Dodgers/Lakers) or just show total watched
  let wins = 0, losses = 0
  finalGames.forEach(g => {
    const homeWon = g.homeScore > g.awayScore
    // For MLB/NBA we can check if the featured team is home or away
    // and whether they won
    const featuredTeamIds = {
      mlb: '119', // Dodgers
      nba: '13',  // Lakers (ESPN id)
      nfl: null,  // All teams
      bbl: null,
    }
    const featuredId = featuredTeamIds[league.id]
    if (featuredId) {
      if (g.homeTeamId === featuredId) {
        homeWon ? wins++ : losses++
      } else if (g.awayTeamId === featuredId) {
        homeWon ? losses++ : wins++
      }
    }
  })

  const totalWatched = watched.length
  const avgHomeScore = finalGames.length
    ? (finalGames.reduce((s, g) => s + g.homeScore, 0) / finalGames.length).toFixed(1)
    : '—'

  return (
    <div className="rounded-xl border border-slate-800 bg-[#111118] p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{league.emoji}</span>
        <div>
          <p className="font-semibold text-slate-200">{league.name}</p>
          <p className="text-xs text-slate-600">{league.description}</p>
        </div>
      </div>

      {totalWatched === 0 ? (
        <p className="text-sm text-slate-600">No watched games yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-900 p-3">
            <p className="text-xs text-slate-600 mb-1">Watched</p>
            <p className="text-xl font-bold text-slate-100">{totalWatched}</p>
          </div>
          {(league.id === 'mlb' || league.id === 'nba') && wins + losses > 0 && (
            <>
              <div className="rounded-lg bg-slate-900 p-3">
                <p className="text-xs text-slate-600 mb-1">Record</p>
                <p className="text-xl font-bold text-slate-100">{wins}–{losses}</p>
              </div>
              <div className="rounded-lg bg-slate-900 p-3">
                <p className="text-xs text-slate-600 mb-1">Win %</p>
                <p className="text-xl font-bold text-slate-100">
                  {wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) + '%' : '—'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {totalWatched > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-xs text-slate-600">Recent watched games:</p>
          <div className="mt-2 flex flex-col gap-1">
            {watched.slice(0, 5).map(g => (
              <div key={`${g.league}_${g.gameId}`} className="flex items-center justify-between text-xs">
                <span className="text-slate-400 truncate">{g.awayTeam} @ {g.homeTeam}</span>
                {g.homeScore !== null && (
                  <span className="text-slate-500 shrink-0 ml-2">
                    {g.awayScore}–{g.homeScore}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function StatsView() {
  const { watchedGames, loading } = useWatched()
  const totalWatched = Object.values(watchedGames).filter(g => g.watched).length

  if (!isFirebaseConfigured) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Stats</h2>
              <p className="text-sm text-slate-500">From watched games</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-amber-900/20 border border-amber-800 p-6 text-center">
          <p className="text-amber-400 font-medium mb-2">Firebase not configured</p>
          <p className="text-sm text-slate-500">
            Connect Firebase to start tracking watched games and see your stats here.
            Edit <code className="text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded text-xs">src/firebase.js</code> with your credentials.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📊</span>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Stats</h2>
            <p className="text-sm text-slate-500">From watched games only</p>
          </div>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Watched" value={totalWatched} sub="across all leagues" />
        {LEAGUES.map(l => {
          const count = Object.values(watchedGames).filter(g => g.league === l.id && g.watched).length
          return <StatCard key={l.id} label={l.name} value={count} sub="games watched" />
        })}
      </div>

      {/* Per-league breakdown */}
      <div className="flex flex-col gap-4">
        {LEAGUES.map(league => (
          <LeagueStats key={league.id} league={league} />
        ))}
      </div>
    </div>
  )
}
