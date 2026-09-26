// Shared NFL team reference: name, abbreviation, division and logo. Lives here
// rather than in a view so the schedule, standings and quarterback tabs all
// agree on abbreviations and division ordering.

export const NFL_TEAMS = {
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

export const NFL_DIVISION_ORDER = [
  'AFC East', 'AFC North', 'AFC South', 'AFC West',
  'NFC East', 'NFC North', 'NFC South', 'NFC West',
]

export function nflLogo(abbr) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`
}

// Abbreviation → team name, for data keyed by abbreviation (the quarterback
// history file) rather than by ESPN's numeric team ids.
export const NFL_TEAM_BY_ABBR = Object.fromEntries(
  Object.entries(NFL_TEAMS).map(([name, t]) => [t.abbr, { ...t, name }])
)

// Teams in division order, the running order the quarterback grid uses.
export const NFL_TEAMS_BY_DIVISION = NFL_DIVISION_ORDER.map(div => ({
  division: div,
  teams: Object.entries(NFL_TEAMS)
    .filter(([, t]) => t.div === div)
    .map(([name, t]) => ({ ...t, name })),
}))
