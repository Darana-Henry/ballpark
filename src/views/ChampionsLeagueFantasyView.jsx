import data from '../data/championsLeaguePlayers.json'
import { FANTASY_LEAGUE_MAP } from '../constants/fantasyLeagues'
import FantasyLeagueView from './FantasyLeagueView'

// Lazy-loaded from App.jsx, so the league's data stays out of the main bundle.
// UEFA's game keeps the user's team, leaderboards and past seasons behind a
// login, so there's no squad, top managers or history here, and the tab
// hides the panels that need them.
export default function ChampionsLeagueFantasyView() {
  return <FantasyLeagueView league={FANTASY_LEAGUE_MAP.championsLeague} data={data} history={null} />
}
