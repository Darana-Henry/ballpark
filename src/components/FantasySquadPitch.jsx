import { useFantasyData, useLabels, perLeague } from '../contexts/fantasyData'
import { DIFFICULTY } from '../utils/fantasyFixtures'

// The pitch the squad panels draw (My team, Ideal team, chip squads): an XI
// in formation, the bench in order, a card per player with fixture and
// projected points. Cards can carry a corner badge (↑/↓, new) and be tapped.

const teamsOf = perLeague(data => Object.fromEntries(data.teams.map(t => [t.id, t])))

const STATUS_SHIRT = {
  injured: '#ef4444',
  suspended: '#ef4444',
  unavailable: '#64748b',
  doubtful: '#f59e0b',
}

function Shirt({ color }) {
  return (
    <svg viewBox="0 0 40 38" className="w-9 h-9 sm:w-11 sm:h-11 drop-shadow" aria-hidden="true">
      <path d="M8 4 L15 1.5 Q20 6 25 1.5 L32 4 L39 12 L33 17 L32 15.5 L32 37 L8 37 L8 15.5 L7 17 L1 12 Z" fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
    </svg>
  )
}

// One round's fixtures as "BOU (H) + ARS (A)"; several rounds' compactly, as
// the games' own fixture tickers do: home in capitals, away in lower case.
function fixtureLabel(games, TEAMS, rounds) {
  if (!games.length) return 'No game'
  if (rounds > 1) return games.map(g => (g.home ? TEAMS[g.opponent].short : TEAMS[g.opponent].short.toLowerCase())).join(' ')
  return games.map(g => `${TEAMS[g.opponent].short} (${g.home ? 'H' : 'A'})`).join(' + ')
}

/**
 * `player` needs `games` and `projection.points` (plus form, fixture and
 * fitness for the hover breakdown). `badge` is `{ text, className, title }`.
 */
export function PlayerCard({ player, captain, vice, star, badge, rounds = 1, onClick, selected, price }) {
  const TEAMS = teamsOf(useFantasyData().data)
  const { C } = useLabels()
  const { projection, games } = player
  const shirt = STATUS_SHIRT[player.availability] ?? '#6366f1'
  const hint = [
    `${player.fullName} · ${TEAMS[player.team].name} · ${C}${player.price.toFixed(1)}`,
    star && 'Star player: scores 1.5×',
    projection.form != null && `Form ${projection.form.toFixed(1)} pts per round × fixture ${projection.fixture.toFixed(2)} × fitness ${Math.round(projection.fitness * 100)}%`,
    player.news,
  ].filter(Boolean).join('\n')
  const difficulty = games.length ? DIFFICULTY[Math.round(games.reduce((s, g) => s + g.difficulty, 0) / games.length)].className : 'bg-slate-800 text-slate-400'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative flex flex-col items-center w-[4.25rem] sm:w-28 ${onClick ? 'cursor-pointer rounded-lg transition-transform hover:-translate-y-0.5' : ''} ${selected ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-emerald-800 rounded-lg' : ''}`}
      title={hint}
    >
      <div className="relative">
        <Shirt color={shirt} />
        {star && (
          <span className="absolute -top-1 -right-2 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center border bg-amber-400 text-slate-900 border-amber-200" title="Star player (1.5×)">★</span>
        )}
        {(captain || vice) && (
          <span className={`absolute -top-1 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center border ${captain ? 'bg-amber-400 text-slate-900 border-amber-200' : 'bg-slate-200 text-slate-900 border-white'}`}>
            {captain ? 'C' : 'V'}
          </span>
        )}
        {badge && (
          <span className={`absolute -top-1 -left-2 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${badge.className}`} title={badge.title}>
            {badge.text}
          </span>
        )}
      </div>
      <div className="w-full mt-0.5 rounded-t-md bg-slate-950/90 px-1 py-0.5 text-center">
        <p className="text-[10px] sm:text-xs font-semibold text-slate-100 truncate">{player.shortName}</p>
        {/* `price` = { now, sells }: "1,686 pts | € 10.2", the season's points so far
            and the current price, plus what an owned player sells for when that's
            less. On a phone the two halves stack. */}
        {price && (
          <p
            className="flex flex-col items-center sm:flex-row sm:justify-center sm:gap-x-1 text-[9px] sm:text-[10px] leading-tight tabular-nums"
            title={`Season points so far · price ${C}${price.now.toFixed(1)}m${price.sells != null && price.sells < price.now - 0.05 ? ` · you'd sell for ${C}${price.sells.toFixed(1)}m` : ''}`}
          >
            {player.total != null && <span className="text-slate-300 whitespace-nowrap">{Math.round(player.total).toLocaleString('en-US')} pts</span>}
            {player.total != null && <span className="hidden sm:inline text-slate-600">|</span>}
            <span className="text-slate-400 whitespace-nowrap">
              {C} {price.now.toFixed(1)}{price.sells != null && price.sells < price.now - 0.05 && <span className="text-slate-500"> ({price.sells.toFixed(1)})</span>}
            </span>
          </p>
        )}
      </div>
      <div className={`w-full px-1 py-0.5 text-center text-[9px] sm:text-[10px] font-semibold truncate ${difficulty}`}>
        {fixtureLabel(games, TEAMS, rounds)}
      </div>
      <div className="w-full rounded-b-md bg-white/90 px-1 py-0.5 text-center text-[10px] sm:text-xs font-bold text-slate-900 tabular-nums">
        {projection.points.toFixed(1)}
      </div>
    </Tag>
  )
}

// Pitch markings: halfway line and centre circle at the top (the attacking
// end is up), penalty box at the keeper's end.
export function Pitch({ children }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-emerald-900/60 py-4 sm:py-6"
      style={{ background: 'repeating-linear-gradient(180deg, #166534 0 48px, #15803d 48px 96px)' }}
    >
      <div className="absolute inset-3 border-2 border-white/25 rounded-sm pointer-events-none" />
      <div className="absolute left-1/2 top-3 -translate-x-1/2 -translate-y-1/2 w-28 h-28 sm:w-36 sm:h-36 rounded-full border-2 border-white/25 pointer-events-none" />
      <div className="absolute left-1/2 bottom-3 -translate-x-1/2 w-1/2 h-20 sm:h-24 border-2 border-b-0 border-white/25 pointer-events-none" />
      <div className="absolute left-1/2 bottom-3 -translate-x-1/2 w-1/4 h-8 sm:h-10 border-2 border-b-0 border-white/25 pointer-events-none" />
      <div className="relative flex flex-col gap-4 sm:gap-6">{children}</div>
    </div>
  )
}

/**
 * A lineup from pickLineup on the pitch, bench below. `cardProps(player)`
 * adds a card's badge, onClick and selected state.
 */
export function SquadPitch({ lineup, rounds = 1, cardProps = () => ({}) }) {
  const { starters, bench, captain, vice, stars = [] } = lineup
  const card = p => <PlayerCard key={p.id} player={p} captain={p === captain} vice={p === vice} star={stars.includes(p)} rounds={rounds} {...cardProps(p)} />
  return (
    <>
      <Pitch>
        {/* Forwards at the top, keeper at the bottom */}
        {[4, 3, 2, 1].map(pos => (
          <div key={pos} className="flex justify-evenly px-1">
            {starters.filter(p => p.position === pos).map(card)}
          </div>
        ))}
      </Pitch>
      <div className="mt-3 rounded-2xl px-2 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 px-1 mb-2">Bench · in order</p>
        <div className="flex justify-evenly">
          {bench.map((p, i) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{i === 0 && p.position === 1 ? 'GK' : i}</span>
              {card(p)}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * The pitch with a panel beside it on wide screens (below it on phones,
 * scrolled into view): what a tapped player opens. `hint` fills the side
 * column on wide screens until something is tapped.
 */
export function WithSidePanel({ children, side, hint }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,46rem)_22rem] lg:gap-4 lg:items-start">
      <div className="min-w-0">{children}</div>
      {side
        ? <aside className="mt-3 lg:mt-0 lg:sticky lg:top-4">{side}</aside>
        : <aside className="hidden lg:block rounded-2xl p-4 text-xs text-slate-500 border border-dashed border-white/10">{hint}</aside>}
    </div>
  )
}
