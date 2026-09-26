import { useState, useEffect, useMemo } from 'react'
import { useWatched } from '../contexts/WatchedContext'
import { LEAGUE_MAP } from '../constants/leagues'

// ─── Glass style ──────────────────────────────────────────────────────────────

const GLASS = {
  background: 'linear-gradient(140deg, rgba(15,20,50,0.92) 0%, rgba(8,10,28,0.96) 100%)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
}

// Soccer has draws; basketball/baseball/football do not
const HAS_DRAW = { mls: true, epl: true, bbl: true }

const LEAGUE_NAME = { mlb: 'MLB', nba: 'NBA', nfl: 'NFL', mls: 'MLS', epl: 'EPL', bbl: 'BBL' }

// ─── Player leaders fetchers per league ───────────────────────────────────────

async function fetchMLBLeaders() {
  const year = new Date().getFullYear()
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=homeRuns,earnedRunAverage&season=${year}&leaderGameTypes=R&limit=5&statGroup=hitting,pitching`
  )
  if (!res.ok) return []
  const data = await res.json()
  const cats = (data.leagueLeaders ?? [])
    .filter(c => ['homeRuns', 'earnedRunAverage'].includes(c.leaderCategory))
    .slice(0, 2)
  return cats.map(cat => ({
    name: cat.leaderCategory === 'homeRuns' ? 'Home Runs' : 'ERA',
    leaders: (cat.leaders ?? []).slice(0, 3).map(l => ({
      name: l.person?.fullName ?? '?',
      shortName: l.person?.fullName?.split(' ').slice(-1)[0] ?? '?',
      photo: l.person?.id
        ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${l.person.id}/headshot/67/current`
        : null,
      value: cat.leaderCategory === 'earnedRunAverage'
        ? parseFloat(l.value).toFixed(2)
        : l.value,
      team: l.team?.name?.split(' ').slice(-1)[0] ?? null,
    })),
  })).filter(c => c.leaders.length > 0)
}

async function fetchNBALeaders() {
  const res = await fetch(
    'https://stats.nba.com/stats/leagueleaders?LeagueID=00&PerMode=PerGame&Scope=S&Season=2025-26&SeasonType=Regular%20Season&StatCategory=PTS',
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.nba.com' } }
  )
  if (!res.ok) return []
  const data = await res.json()
  const rs = data.resultSet
  const h = rs.headers
  const pi = h.indexOf('PLAYER'), vi = h.indexOf('PTS'),
        ti = h.indexOf('TEAM'), idI = h.indexOf('PLAYER_ID')
  return [{
    name: 'Points Per Game',
    leaders: rs.rowSet.slice(0, 3).map(row => ({
      name:  row[pi],
      shortName: row[pi]?.split(' ').slice(-1)[0] ?? '?',
      photo: `https://cdn.nba.com/headshots/nba/latest/1040x760/${row[idI]}.png`,
      value: row[vi],
      team:  row[ti],
    })),
  }]
}

async function fetchSoccerLeaders(slug) {
  const now    = new Date()
  const season = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  const year   = slug === 'usa.1' ? now.getFullYear() : season
  const res    = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/statistics?season=${year}&seasontype=2`
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.stats ?? []).slice(0, 2).map(cat => ({
    name: cat.displayName,
    leaders: (cat.leaders ?? []).slice(0, 3).map(l => ({
      name:      l.athlete?.displayName ?? '?',
      shortName: l.athlete?.shortName ?? l.athlete?.displayName?.split(' ').slice(-1)[0] ?? '?',
      photo:     l.athlete?.headshot?.href ?? null,
      value:     Math.round(l.value),
      team:      null,
    })),
  })).filter(c => c.leaders.length > 0)
}

const FETCHERS = {
  mlb: fetchMLBLeaders,
  nba: fetchNBALeaders,
  mls: () => fetchSoccerLeaders('usa.1'),
  epl: () => fetchSoccerLeaders('eng.1'),
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerPhoto({ src, alt }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="w-6 h-6 rounded-full bg-slate-700 shrink-0 flex items-center justify-center text-[7px] font-bold text-slate-400">
        {alt?.[0] ?? '?'}
      </div>
    )
  }
  return (
    <img src={src} alt={alt} width={24} height={24}
      className="w-6 h-6 rounded-full object-cover object-top bg-slate-800 shrink-0"
      onError={() => setErr(true)} />
  )
}

function PlayerRow({ player, rank }) {
  const rankColor = rank === 0 ? 'text-yellow-400' : rank === 1 ? 'text-slate-300' : 'text-slate-600'
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[9px] font-bold tabular-nums w-3 shrink-0 ${rankColor}`}>{rank + 1}</span>
      <PlayerPhoto src={player.photo} alt={player.shortName} />
      <span className="text-[11px] text-slate-300 flex-1 truncate">{player.name}</span>
      {player.team && (
        <span className="text-[9px] text-slate-600 shrink-0 hidden sm:block">{player.team}</span>
      )}
      <span className="text-xs font-bold text-slate-100 tabular-nums shrink-0">{player.value}</span>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Two progress lines for the league's landing page.
//
// Completion  — of the games already played, how many have been watched. This
//               is the "10 of 10 played = 100%" measure.
// Season      — of every game the season holds, how many have been watched.
//               Always the smaller number early on, and the one that says how
//               much of the whole season is still ahead.
//
// Both come from the schedule the view has already loaded, so this costs no
// request and works for BBL and cricket, whose games need the user's API key.
function ProgressLine({ label, watched, total, caption, accentColor }) {
  const pct = total ? Math.min(100, Math.round((watched / total) * 100)) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
        <span className="text-sm font-bold tabular-nums leading-none" style={{ color: total ? accentColor : '#475569' }}>
          {total ? `${pct}%` : '—'}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: accentColor }} />
      </div>
      <p className="text-[10px] text-slate-600 mt-1">{caption}</p>
    </div>
  )
}

export default function SeasonStatsPanel({ league, trackedTeamId = null, games = null }) {
  const { watchedGames } = useWatched()
  const [leaders, setLeaders] = useState([])
  const [loadingPlayers, setLoadingPlayers] = useState(!!FETCHERS[league])

  // Fetch league leaders on mount
  useEffect(() => {
    const fn = FETCHERS[league]
    if (!fn) return
    fn()
      .then(setLeaders)
      .catch(() => setLeaders([]))
      .finally(() => setLoadingPlayers(false))
  }, [league])

  // Ids of every game in this season, taken from the schedule the view loaded.
  // Membership of that set is what makes a watched game "this season" — far
  // safer than comparing dates, which breaks at a season boundary (in late
  // September the NBA and BBL schedules are already next season's).
  const seasonGameIds = useMemo(
    () => (games?.length ? new Set(games.map(g => String(g.id))) : null),
    [games]
  )

  // Season record from Firestore watched games, scoped to this season. Without
  // a schedule to scope against it falls back to counting everything, which is
  // the old behaviour rather than a silent zero.
  const stats = useMemo(() => {
    const games = Object.values(watchedGames).filter(
      g => g.league === league
        && g.watched
        && (!seasonGameIds || seasonGameIds.has(String(g.gameId)))
    )

    if (!trackedTeamId) {
      return { total: games.length, wins: null, losses: null, draws: null, form: [] }
    }

    let wins = 0, losses = 0, draws = 0

    const withResult = games
      .filter(g => {
        if (g.homeScore === null || g.awayScore === null) return false
        return g.homeTeamId === trackedTeamId || g.awayTeamId === trackedTeamId
      })
      .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))

    for (const g of withResult) {
      const isHome = g.homeTeamId === trackedTeamId
      const ts = isHome ? g.homeScore : g.awayScore
      const os = isHome ? g.awayScore  : g.homeScore
      if (ts > os) wins++
      else if (ts < os) losses++
      else draws++
    }

    const form = withResult.slice(-10).map(g => {
      const isHome = g.homeTeamId === trackedTeamId
      const ts = isHome ? g.homeScore : g.awayScore
      const os = isHome ? g.awayScore  : g.homeScore
      return ts > os ? 'win' : ts < os ? 'loss' : 'draw'
    })

    return { total: games.length, wins, losses, draws, form }
  }, [watchedGames, league, trackedTeamId, seasonGameIds])

  const hasDraw  = HAS_DRAW[league] ?? false
  const hasStats = stats.wins !== null

  // Season progress, measured against the schedule this view already holds.
  //
  // Every league view loads exactly one season, so the games passed in *are*
  // the season — no date filtering. Filtering by season year would actually be
  // wrong near a boundary: in late September the NBA and BBL schedules are
  // already next season's, which a "current season year" check discards.
  const progress = useMemo(() => {
    if (!games?.length || !seasonGameIds) return null
    const played = games.filter(g => g.status === 'final')
    const playedIds = new Set(played.map(g => String(g.id)))

    const watchedRecords = Object.values(watchedGames).filter(
      g => g.league === league && g.watched && seasonGameIds.has(String(g.gameId))
    )
    return {
      total: games.length,
      played: played.length,
      watched: watchedRecords.length,
      watchedPlayed: watchedRecords.filter(g => playedIds.has(String(g.gameId))).length,
    }
  }, [games, league, watchedGames, seasonGameIds])

  const accentColor = LEAGUE_MAP[league]?.accentColor ?? '#64748b'

  return (
    <div className="rounded-2xl p-5 flex flex-col h-full" style={GLASS}>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
            Season Record
          </p>
          <p className="text-xs text-slate-600">
            {LEAGUE_NAME[league] ?? league.toUpperCase()} · {stats.total} watched
          </p>
        </div>
      </div>

      {progress && (
        <div className="flex flex-col gap-2.5 mb-4 pb-4 border-b border-white/[0.06]">
          <ProgressLine
            label="Completion"
            watched={progress.watchedPlayed}
            total={progress.played}
            caption={progress.played ? `${progress.watchedPlayed} of ${progress.played} played` : 'no games played yet'}
            accentColor={accentColor}
          />
          <ProgressLine
            label="Season"
            watched={progress.watched}
            total={progress.total}
            caption={`${progress.watched} of ${progress.total} this season · ${progress.played} played so far`}
            accentColor={accentColor}
          />
        </div>
      )}

      {stats.total === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-600 text-sm text-center leading-relaxed">
            Watch games to<br />build your record
          </p>
        </div>
      ) : !hasStats ? (
        /* NFL / BBL — no tracked team, show big count */
        <div className="flex-1 flex flex-col items-center justify-center gap-1">
          <p className="text-7xl font-bold text-slate-200 leading-none tabular-nums">
            {stats.total}
          </p>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-2">
            games watched
          </p>
        </div>
      ) : (
        <>
          {/* W / (D) / L — spread evenly across full width */}
          <div className="flex items-end justify-evenly mt-2 mb-4">
            <div className="flex-1 text-center">
              <p className="text-6xl font-bold text-green-400 leading-none tabular-nums">{stats.wins}</p>
              <p className="text-[9px] font-bold text-green-700 uppercase tracking-widest mt-2">Win</p>
            </div>
            {hasDraw && (
              <div className="flex-1 text-center">
                <p className="text-6xl font-bold text-slate-500 leading-none tabular-nums">{stats.draws}</p>
                <p className="text-[9px] font-bold text-slate-700 uppercase tracking-widest mt-2">Draw</p>
              </div>
            )}
            <div className="flex-1 text-center">
              <p className="text-6xl font-bold text-red-400 leading-none tabular-nums">{stats.losses}</p>
              <p className="text-[9px] font-bold text-red-800 uppercase tracking-widest mt-2">Loss</p>
            </div>
          </div>

          {/* Form dots — centered */}
          {stats.form.length > 0 && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <p className="text-[9px] text-slate-700 uppercase tracking-widest shrink-0">Form</p>
              <div className="flex gap-1.5">
                {stats.form.map((r, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full ${
                    r === 'win'  ? 'bg-green-500' :
                    r === 'loss' ? 'bg-red-500'   : 'bg-slate-500'
                  }`} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* League leaders — bottom section */}
      {loadingPlayers ? (
        <div className="mt-auto pt-3 flex flex-col gap-1.5 animate-pulse"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-3 h-2 rounded bg-slate-700/60" />
              <div className="w-6 h-6 rounded-full bg-slate-700/60 shrink-0" />
              <div className="flex-1 h-2 rounded bg-slate-700/60" />
              <div className="w-6 h-2 rounded bg-slate-700/60" />
            </div>
          ))}
        </div>
      ) : leaders.length > 0 ? (
        <div
          className="mt-auto pt-3 flex flex-col gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          {leaders.slice(0, 2).map(cat => (
            <div key={cat.name} className="flex flex-col gap-1.5">
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                {cat.name}
              </p>
              {cat.leaders.map((p, i) => (
                <PlayerRow key={p.name} player={p} rank={i} />
              ))}
            </div>
          ))}
        </div>
      ) : null}

    </div>
  )
}
