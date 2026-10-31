// The competition a game belongs to, for the All games / Watched / Standings
// filters. `gameType` is too fine for that on its own: ESPN puts the playoff
// round there ("East 1st Round - Game 3") and MLB the postseason series, so
// those are folded into one competition per league.
//
// The NBA Cup's group games and knockouts count toward the regular-season
// record (all but the final), but the Cup is followed as its own competition,
// so its games sit under "NBA Cup" rather than "Regular Season".

const NFL_PLAYOFF_NOTE = /wild ?card|divisional|championship|super bowl|playoff/i
const MLB_POSTSEASON = new Set(['Wild Card', 'Division Series', 'League Championship', 'World Series', 'Championship'])

export function competitionOf(game) {
  const type = game.gameType ?? ''
  switch (game.league) {
    case 'nba':
      if (/^NBA Cup/i.test(type)) return 'NBA Cup'
      if (game.seasonType === 3 || game.seasonType === 5 || /play-?in|playoff|round|finals/i.test(type)) return 'Playoffs'
      return 'Regular Season'
    case 'nfl':
      // Stored watched records carry no seasonType, only the game's note.
      if (game.seasonType === 3) return 'Playoffs'
      // Regular-season games can carry their own note ("NFL London Games",
      // "Flex Game: 12/26"), so only a playoff round's wording counts.
      if (game.seasonType === 1 || /preseason|hall of fame/i.test(type)) return 'Preseason'
      if (game.seasonType == null && NFL_PLAYOFF_NOTE.test(type)) return 'Playoffs'
      return 'Regular Season'
    case 'mlb':
      if (MLB_POSTSEASON.has(type)) return 'Postseason'
      return type || 'Regular Season'
    default:
      // Soccer leagues already name the competition: "Premier League",
      // "Carabao Cup", "UEFA Champions League", …
      return type || 'Other'
  }
}

// Each league's competitions in a fixed reading order; anything not listed
// (soccer cups) follows in order of first appearance.
const ORDER = {
  nba: ['Regular Season', 'NBA Cup', 'Playoffs'],
  nfl: ['Preseason', 'Regular Season', 'Playoffs'],
  mlb: ['Spring Training', 'Regular Season', 'Postseason'],
}

export function competitionsIn(games, league) {
  const seen = []
  for (const g of games) {
    const c = competitionOf(g)
    if (!seen.includes(c)) seen.push(c)
  }
  const order = ORDER[league] ?? []
  const rank = c => (order.includes(c) ? order.indexOf(c) : order.length)
  return seen
    .map((c, i) => [c, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([c]) => c)
}

export function filterByCompetition(games, competition) {
  if (!competition || competition === 'all') return games
  return games.filter(g => competitionOf(g) === competition)
}
