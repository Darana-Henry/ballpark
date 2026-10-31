import { useState, useMemo, Fragment } from 'react'
import { FantasyDataContext, useFantasyData, perLeague } from '../contexts/fantasyData'
import FantasyLeagueIcon from '../components/FantasyLeagueIcon'
import Chip from '../components/FilterChip'
import FantasyFixtures, { FixtureCell } from '../components/FantasyFixtures'
import FantasyTopManagers from '../components/FantasyTopManagers'
import FantasyMyTeam from '../components/FantasyMyTeam'
import FantasyBestLads from '../components/FantasyBestLads'
import FantasyPlanner from '../components/FantasyPlanner'
import FantasyPerformance from '../components/FantasyPerformance'
import { POSITIONS, withForm, availability } from '../utils/fantasyPlayers'
import { leagueTable, nextRound, upcomingFixtures } from '../utils/fantasyFixtures'

// One fantasy game's tab (Eliteserien, Allsvenskan): the league's data comes
// in as props from its own lazy-loaded view and reaches every panel through
// FantasyDataContext.

const badgeClass = 'inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap'

const STATUSES = {
  available: { label: 'Available' },
  doubtful: { label: 'Doubtful', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  injured: { label: 'Injured', badge: 'bg-red-500/15 text-red-300 border-red-500/30' },
  suspended: { label: 'Suspended', badge: 'bg-red-500/15 text-red-300 border-red-500/30' },
  unavailable: { label: 'Unavailable', badge: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
}

// Current price minus what the user paid, for players in their squad.
function ValueChange({ player, bought }) {
  const change = Math.round((player.price - bought) * 10) / 10
  const tone = change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-slate-500'
  return (
    <span className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${tone}`} title={`Bought for £${bought.toFixed(1)}, now £${player.price.toFixed(1)}`}>
      {change > 0 ? '+' : change < 0 ? '−' : '±'}{Math.abs(change).toFixed(1)}
    </span>
  )
}

function availabilityDetail(p) {
  const until = p.absence?.until
    ? ` until ${new Date(p.absence.until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : ''
  return [
    p.news,
    p.absence && `Transfermarkt: ${p.absence.reason}${until}`,
    p.yellowCards && `${p.yellowCards} yellow cards, one booking from a ban`,
  ].filter(Boolean).join('\n')
}

const derive = perLeague(data => {
  const LAST_ROUND = data.rounds.at(-1)
  // Each club's most recent penalty taker among its current players is its
  // first-choice taker; anyone else who has taken one shows muted.
  const FIRST_CHOICE = new Set()
  const latest = {}
  for (const p of data.players) {
    if (p.penalties?.last && (!latest[p.team] || p.penalties.last > latest[p.team].penalties.last)) latest[p.team] = p
  }
  for (const p of Object.values(latest)) FIRST_CHOICE.add(p.id)

  // League position after the last finished round, beside the team.
  const TABLE = leagueTable(data.fixtures, data.teams, LAST_ROUND)

  // Each team's next three rounds, shown at the end of the table.
  const NEXT = upcomingFixtures(data.fixtures, data.teams, nextRound(data.fixtures), 3)
  const nextAvg = team => {
    const games = (NEXT.byTeam.get(team) ?? []).flat()
    return games.length ? games.reduce((sum, g) => sum + g.difficulty, 0) / games.length : Infinity
  }

  return {
    TEAMS: Object.fromEntries(data.teams.map(t => [t.id, t])),
    LAST_ROUND,
    // Shown inline as their own columns; the rest open from the row.
    RECENT: data.rounds.slice(-5).map(round => ({ round, index: data.rounds.indexOf(round) })),
    MY_PICKS: new Map((data.mySquad?.picks ?? []).map(p => [p.id, p])),
    FIRST_CHOICE,
    NEXT,
    PLAYERS: data.players.map(p => ({
      ...withForm(p),
      availability: availability(p),
      penaltiesTaken: p.penalties?.taken ?? 0,
      nextAvg: nextAvg(p.team),
      teamRank: TABLE.get(p.team)?.rank ?? Infinity,
    })),
  }
})

// The last-5 round columns sit between these two groups.
const VALUE_COLUMNS = [
  { key: 'price', label: '£', title: 'Current price', format: p => p.price.toFixed(1) },
  { key: 'ownership', label: 'Own %', title: 'Selected by % of managers', format: p => p.ownership.toFixed(1) },
]
const FORM_COLUMNS = [
  { key: 'total', label: 'Pts', title: 'Season points' },
  { key: 'last7', label: 'L7', title: 'Points in the last 7 rounds' },
  { key: 'last4', label: 'L4', title: 'Points in the last 4 rounds' },
  { key: 'minutesTotal', label: 'Min', title: 'Season minutes' },
  { key: 'minutes7', label: 'L7 min', title: 'Minutes in the last 7 rounds' },
  { key: 'minutes4', label: 'L4 min', title: 'Minutes in the last 4 rounds' },
]
function PenaltyBadge({ player }) {
  const { FIRST_CHOICE } = derive(useFantasyData().data)
  const pens = player.penalties
  if (!pens) return null
  const first = FIRST_CHOICE.has(player.id)
  const last = new Date(pens.last).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <span
      className={`${badgeClass} ${first ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-500/10 text-slate-400 border-slate-600/40'}`}
      title={`${pens.taken} taken, ${pens.scored} scored · last ${last}${first ? ' · club\'s latest taker' : ''}`}
    >
      Pen ×{pens.taken}
    </span>
  )
}

function StatusCell({ player }) {
  const status = STATUSES[player.availability]
  const detail = availabilityDetail(player)
  return (
    <div className="flex items-center gap-1" title={detail || undefined}>
      {status.badge && <span className={`${badgeClass} ${status.badge}`}>{status.label}</span>}
      {player.yellowCards && (
        <span className={`${badgeClass} bg-yellow-400/10 text-yellow-300 border-yellow-400/30`}>{player.yellowCards} YC</span>
      )}
    </div>
  )
}

const selectClass = 'bg-slate-900 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200'

// Toggle a value in a Set held in state; an empty set means "all".
const toggleIn = (set, value) => {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function RoundStrip({ player }) {
  const { data } = useFantasyData()
  return (
    <div className="flex flex-wrap gap-1 py-2">
      {data.rounds.map((round, i) => {
        const pts = player.points[i]
        const mins = player.minutes[i]
        return (
          <div
            key={round}
            className={`w-12 rounded-md px-1 py-1 text-center ${mins ? 'bg-slate-800/70' : 'bg-slate-900/60'}`}
            title={`GW${round}: ${pts ?? '–'} pts, ${mins ?? '–'} min`}
          >
            <p className="text-[9px] text-slate-600">GW{round}</p>
            <p className={`text-xs font-semibold tabular-nums ${pts >= 6 ? 'text-emerald-400' : mins ? 'text-slate-200' : 'text-slate-600'}`}>{pts ?? '–'}</p>
            <p className="text-[9px] text-slate-500 tabular-nums">{mins ?? '–'}′</p>
          </div>
        )
      })}
    </div>
  )
}

function RoundCell({ pts, mins }) {
  return (
    <td className="px-1.5 py-1.5 text-center tabular-nums">
      <p className={`text-sm font-semibold leading-tight ${pts >= 6 ? 'text-emerald-400' : mins ? 'text-slate-200' : 'text-slate-600'}`}>{pts ?? '–'}</p>
      <p className="text-[10px] text-slate-500 leading-tight">{mins ?? '–'}′</p>
    </td>
  )
}

function PlayersPanel() {
  const { data } = useFantasyData()
  const { TEAMS, LAST_ROUND, RECENT, MY_PICKS, NEXT } = derive(data)
  const COLUMN_COUNT = VALUE_COLUMNS.length + RECENT.length + FORM_COLUMNS.length + NEXT.rounds.length + 7
  const [positions, setPositions] = useState(new Set())
  const [statuses, setStatuses] = useState(new Set())
  const [banRisk, setBanRisk] = useState(false)
  const [team, setTeam] = useState('')
  const [priceCap, setPriceCap] = useState('')
  const [query, setQuery] = useState('')
  const [playedOnly, setPlayedOnly] = useState(true)
  const [onPens, setOnPens] = useState(false)
  const [mineOnly, setMineOnly] = useState(false)
  const [sort, setSort] = useState({ key: 'total', desc: true })
  const [expanded, setExpanded] = useState(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cap = parseFloat(priceCap)
    const { PLAYERS, MY_PICKS } = derive(data)
    const filtered = PLAYERS.filter(p =>
      (!positions.size || positions.has(p.position)) &&
      (!statuses.size || statuses.has(p.availability)) &&
      (!banRisk || p.yellowCards) &&
      (!team || p.team === Number(team)) &&
      (Number.isNaN(cap) || p.price <= cap) &&
      (!playedOnly || p.minutesTotal > 0 || MY_PICKS.has(p.id)) &&
      (!onPens || p.penaltiesTaken > 0) &&
      (!mineOnly || MY_PICKS.has(p.id)) &&
      (!q || [p.name, p.fullName, p.shortName].some(n => n.toLowerCase().includes(q))),
    )
    const dir = sort.desc ? -1 : 1
    return filtered.sort((a, b) => dir * (a[sort.key] - b[sort.key]) || b.total - a.total)
  }, [data, positions, statuses, banRisk, team, priceCap, query, playedOnly, onPens, mineOnly, sort])

  // Most columns sort highest first; difficulty sorts easiest first.
  const toggleSort = (key, ascFirst) => setSort(s => ({ key, desc: s.key === key ? !s.desc : !ascFirst }))

  // Back to the defaults above; the sort order is left alone.
  const filtered = positions.size || statuses.size || banRisk || team || priceCap || query || !playedOnly || onPens || mineOnly
  const resetFilters = () => {
    setPositions(new Set())
    setStatuses(new Set())
    setBanRisk(false)
    setTeam('')
    setPriceCap('')
    setQuery('')
    setPlayedOnly(true)
    setOnPens(false)
    setMineOnly(false)
  }

  const sortHeader = (key, label, title, ascFirst) => (
    <button onClick={() => toggleSort(key, ascFirst)} title={title} className={sort.key === key ? 'text-indigo-300' : 'hover:text-slate-300'}>
      {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </button>
  )

  const statHeader = c => (
    <th key={c.key} className="text-right font-semibold px-2 py-2.5 whitespace-nowrap">{sortHeader(c.key, c.label, c.title)}</th>
  )
  const statCell = (c, p) => (
    <td
      key={c.key}
      className={`px-2 py-2 text-right tabular-nums ${sort.key === c.key ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}
    >
      {c.format ? c.format(p) : p[c.key]}
    </td>
  )

  return (
    <>
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex gap-1">
            <Chip active={!positions.size} onClick={() => setPositions(new Set())}>All</Chip>
            {Object.entries(POSITIONS).map(([id, label]) => (
              <Chip key={id} active={positions.has(Number(id))} onClick={() => setPositions(s => toggleIn(s, Number(id)))}>{label}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(STATUSES).map(([key, { label }]) => (
              <Chip key={key} active={statuses.has(key)} onClick={() => setStatuses(s => toggleIn(s, key))}>{label}</Chip>
            ))}
            <Chip active={banRisk} onClick={() => setBanRisk(v => !v)}>Ban risk</Chip>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={team} onChange={e => setTeam(e.target.value)} className={selectClass} aria-label="Team">
            <option value="">All teams</option>
            {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min="3"
            max="15"
            step="0.1"
            value={priceCap}
            onChange={e => setPriceCap(e.target.value)}
            placeholder="Max £"
            aria-label="Maximum price"
            className={`${selectClass} w-20`}
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search player"
            className={`${selectClass} w-40`}
          />
          <div className="flex flex-wrap gap-1">
            <Chip active={playedOnly} onClick={() => setPlayedOnly(v => !v)}>Played this season</Chip>
            <Chip active={onPens} onClick={() => setOnPens(v => !v)}>Takes pens</Chip>
            {data.mySquad && <Chip active={mineOnly} onClick={() => setMineOnly(v => !v)}>My team</Chip>}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            {filtered && (
              <button onClick={resetFilters} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 border border-slate-700/60 hover:text-slate-100 hover:bg-white/5">
                Reset filters
              </button>
            )}
            <span className="text-xs text-slate-600">{rows.length} players</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
              <th className="sticky md:static left-0 w-12 min-w-12 bg-[#10101a] md:bg-transparent text-left font-semibold px-3 py-2.5">Pos</th>
              <th className="sticky md:static left-12 bg-[#10101a] md:bg-transparent text-left font-semibold px-2 py-2.5">Player</th>
              <th className="text-left font-semibold px-2 py-2.5">Team</th>
              <th className="text-right font-semibold px-2 py-2.5">{sortHeader('teamRank', '#', `Team's league position after GW${LAST_ROUND}`, true)}</th>
              {VALUE_COLUMNS.map(statHeader)}
              {RECENT.map(({ round }) => (
                <th key={round} className="text-center font-semibold px-1.5 py-2.5 whitespace-nowrap" title={`GW${round}: points and minutes`}>GW{round}</th>
              ))}
              {FORM_COLUMNS.map(statHeader)}
              <th className="text-left font-semibold px-2 py-2.5">{sortHeader('penaltiesTaken', 'Pens', 'Penalties taken this season (ESPN)')}</th>
              <th className="text-left font-semibold px-3 py-2.5">Status</th>
              {NEXT.rounds.map(r => <th key={r} className="font-semibold px-1 py-2.5 min-w-[4.5rem]">GW{r}</th>)}
              <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap">{sortHeader('nextAvg', 'Avg', 'Average fixture difficulty over the next 3 rounds (1 easy, 5 hard)', true)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const open = expanded === p.id
              const pick = MY_PICKS.get(p.id)
              const detail = availabilityDetail(p)
              const stickyBg = pick ? 'bg-[#171733] md:bg-transparent' : 'bg-[#10101a] md:bg-transparent'
              return (
                <Fragment key={p.id}>
                  <tr
                    onClick={() => setExpanded(open ? null : p.id)}
                    className={`border-b border-white/5 cursor-pointer ${pick ? 'bg-indigo-500/[0.09] hover:bg-indigo-500/[0.14]' : open ? 'bg-white/5' : 'hover:bg-white/[0.03]'}`}
                  >
                    <td className={`sticky md:static left-0 w-12 min-w-12 ${stickyBg} px-3 py-2 text-xs text-slate-400 ${pick ? 'shadow-[inset_3px_0_0_#6366f1]' : ''}`}>
                      {POSITIONS[p.position]}
                    </td>
                    <td className={`sticky md:static left-12 ${stickyBg} px-2 py-2`}>
                      <div className="flex items-center gap-1.5 max-w-56">
                        <span className="font-semibold text-slate-100 truncate" title={p.fullName}>{p.name}</span>
                        {pick?.captain && <span className={`${badgeClass} bg-indigo-500/20 text-indigo-200 border-indigo-400/40`}>C</span>}
                        {pick?.vice && <span className={`${badgeClass} bg-indigo-500/10 text-indigo-300 border-indigo-400/30`}>VC</span>}
                        {pick?.purchasePrice != null && <ValueChange player={p} bought={pick.purchasePrice} />}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-400 whitespace-nowrap">{TEAMS[p.team]?.name}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${sort.key === 'teamRank' ? 'text-slate-100 font-semibold' : 'text-slate-400'}`}>
                      {Number.isFinite(p.teamRank) ? p.teamRank : '–'}
                    </td>
                    {VALUE_COLUMNS.map(c => statCell(c, p))}
                    {RECENT.map(({ round, index }) => <RoundCell key={round} pts={p.points[index]} mins={p.minutes[index]} />)}
                    {FORM_COLUMNS.map(c => statCell(c, p))}
                    <td className="px-2 py-2"><PenaltyBadge player={p} /></td>
                    <td className="px-3 py-2"><StatusCell player={p} /></td>
                    {(NEXT.byTeam.get(p.team) ?? []).map((games, i) => <FixtureCell key={NEXT.rounds[i]} games={games} />)}
                    <td className={`px-3 py-2 text-right tabular-nums ${sort.key === 'nextAvg' ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
                      {Number.isFinite(p.nextAvg) ? p.nextAvg.toFixed(1) : '–'}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <td colSpan={COLUMN_COUNT} className="px-3">
                        {detail && <p className="text-xs text-amber-300/90 pt-2 whitespace-pre-line">{detail}</p>}
                        <RoundStrip player={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <p className="text-sm text-slate-600 text-center py-10">No players match these filters</p>}
      </div>
    </>
  )
}

const PANELS = {
  players:  { label: 'Players',      Panel: PlayersPanel },
  team:     { label: 'My team',      Panel: FantasyMyTeam },
  plan:     { label: 'Transfers & chips', Panel: FantasyPlanner },
  best:     { label: 'Best by club', Panel: FantasyBestLads },
  fixtures: { label: 'Fixtures',     Panel: FantasyFixtures },
  top:      { label: 'Top managers', Panel: FantasyTopManagers },
  history:  { label: 'Performance',  Panel: FantasyPerformance },
}

/** `league` is the FANTASY_LEAGUE_MAP entry; `data` and `history` its two data files. */
export default function FantasyLeagueView({ league, data, history }) {
  const [panel, setPanel] = useState('players')
  const { Panel } = PANELS[panel]
  const context = useMemo(() => ({ league, data, history }), [league, data, history])
  const lastRound = data.rounds.at(-1)
  return (
    <FantasyDataContext.Provider value={context}>
      <div className="p-4 md:p-6">
        <div className="mb-5 flex items-center gap-3">
          <FantasyLeagueIcon league={league} size={40} />
          <div>
            <h2 className="text-2xl font-bold text-slate-100 leading-tight">{league.name}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Through GW{lastRound} · refreshed {new Date(data.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {data.mySquad && <> · <span className="text-indigo-300">{data.mySquad.name}</span> as of GW{data.mySquad.round}</>}
            </p>
          </div>
        </div>

        {/* Swipes sideways on phones, where the tabs don't all fit */}
        <div className="flex mb-5 rounded-2xl p-1 gap-0.5 w-full sm:w-fit overflow-x-auto scrollbar-hide" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {Object.entries(PANELS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setPanel(key)}
              className={`flex-none px-3 sm:px-4 py-2 rounded-xl text-[13px] sm:text-sm font-medium whitespace-nowrap transition-colors ${panel === key ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
              style={panel === key ? { background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' } : {}}
            >
              {label}
            </button>
          ))}
        </div>

        <Panel />
      </div>
    </FantasyDataContext.Provider>
  )
}
