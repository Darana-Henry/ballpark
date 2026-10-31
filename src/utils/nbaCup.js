// NBA Cup group tables and knockout list, built from the season's Cup games
// (src/api/espn.js fetchNBACupGames).
//
// ESPN never names the groups, but every team plays its four group-mates
// exactly once in group play, so the groups are the connected sets of teams in
// the group-play fixtures. ESPN gives no group letter either, so groups are
// numbered within each conference in a stable order (alphabetical by their
// first team) rather than labelled A/B/C.
//
// `countsResult(game)` decides which results go into the tables. The tab
// passes "watched, or the user chose to reveal everything", so an unwatched
// Cup result is never spoiled by default.

const GROUP_PLAY = /group play/i

export function isGroupPlay(game) {
  return GROUP_PLAY.test(game.gameType ?? '')
}

function findGroups(groupGames) {
  const parent = new Map()
  const find = id => {
    while (parent.get(id) !== id) id = parent.get(id)
    return id
  }
  const add = id => { if (!parent.has(id)) parent.set(id, id) }
  for (const g of groupGames) {
    add(g.homeTeam.id); add(g.awayTeam.id)
    parent.set(find(g.homeTeam.id), find(g.awayTeam.id))
  }
  const groups = new Map()
  for (const id of parent.keys()) {
    const root = find(id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(id)
  }
  return [...groups.values()]
}

// Record, then head-to-head when exactly two teams are level, then points
// difference and points scored in group games: the Cup's own tiebreakers, short
// of the last resort (previous season's record), which isn't in this data.
function rankRows(rows, games) {
  const pct = r => (r.w + r.l ? r.w / (r.w + r.l) : 0)
  const sorted = [...rows].sort((a, b) => pct(b) - pct(a) || b.pd - a.pd || b.pf - a.pf || a.name.localeCompare(b.name))
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i], b = sorted[i + 1]
    const level = pct(a) === pct(b) && (i + 2 >= sorted.length || pct(sorted[i + 2]) !== pct(a)) && (i === 0 || pct(sorted[i - 1]) !== pct(a))
    if (!level) continue
    const meeting = games.find(g =>
      (g.homeTeam.id === a.id && g.awayTeam.id === b.id) || (g.homeTeam.id === b.id && g.awayTeam.id === a.id))
    if (!meeting) continue
    const bWon = meeting.homeTeam.id === b.id
      ? meeting.homeScore > meeting.awayScore
      : meeting.awayScore > meeting.homeScore
    if (bWon) { sorted[i] = b; sorted[i + 1] = a }
  }
  return sorted
}

export function buildCupGroups(cupGames, countsResult) {
  const groupGames = cupGames.filter(isGroupPlay)
  const teamInfo = new Map()
  for (const g of groupGames) {
    teamInfo.set(g.homeTeam.id, g.homeTeam)
    teamInfo.set(g.awayTeam.id, g.awayTeam)
  }

  const groups = findGroups(groupGames).map(ids => {
    const members = new Set(ids)
    const games = groupGames.filter(g => members.has(g.homeTeam.id))
    const counted = games.filter(g => g.status === 'final' && g.homeScore != null && countsResult(g))
    const rows = ids.map(id => {
      const t = teamInfo.get(id)
      const row = { id, name: t.name, abbreviation: t.abbreviation, logo: t.logo, w: 0, l: 0, pf: 0, pa: 0, pd: 0, played: 0 }
      for (const g of counted) {
        const home = g.homeTeam.id === id
        if (!home && g.awayTeam.id !== id) continue
        const mine = home ? g.homeScore : g.awayScore
        const theirs = home ? g.awayScore : g.homeScore
        row.played++
        row.pf += mine; row.pa += theirs
        if (mine > theirs) row.w++; else row.l++
      }
      row.pd = row.pf - row.pa
      return row
    })
    const conference = teamInfo.get(ids[0])?.conference ?? null
    return {
      conference,
      rows: rankRows(rows, counted),
      games: games.sort((a, b) => a.gameDate - b.gameDate),
      totalGames: games.length,
      countedGames: counted.length,
    }
  })

  const byConference = {}
  for (const group of groups) {
    const conf = group.conference ?? 'Other'
    ;(byConference[conf] ??= []).push(group)
  }
  for (const list of Object.values(byConference)) {
    list.sort((a, b) => [...a.rows].map(r => r.name).sort()[0].localeCompare([...b.rows].map(r => r.name).sort()[0]))
    list.forEach((g, i) => { g.label = `${g.conference ?? ''} Group ${i + 1}`.trim() })
  }
  return byConference
}

const ROUND_ORDER = ['Quarterfinals', 'Semifinals', 'Championship']

export function cupKnockouts(cupGames) {
  const rounds = {}
  for (const g of cupGames) {
    if (isGroupPlay(g)) continue
    const round = ROUND_ORDER.find(r => (g.gameType ?? '').includes(r)) ?? g.gameType
    ;(rounds[round] ??= []).push(g)
  }
  return Object.entries(rounds)
    .sort(([a], [b]) => ROUND_ORDER.indexOf(a) - ROUND_ORDER.indexOf(b))
    .map(([round, games]) => ({ round, games: games.sort((a, b) => a.gameDate - b.gameDate) }))
}
