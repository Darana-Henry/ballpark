import data from '../data/bundesligaPlayers.json'
import history from '../data/bundesligaHistory.json'
import { FANTASY_LEAGUE_MAP } from '../constants/fantasyLeagues'
import FantasyLeagueView from './FantasyLeagueView'

// Lazy-loaded from App.jsx, so the league's data stays out of the main bundle.
// The data comes from the user's app exports (npm run bundesliga:import), not
// a feed: the game is app-only.
export default function BundesligaFantasyView() {
  return <FantasyLeagueView league={FANTASY_LEAGUE_MAP.bundesliga} data={data} history={history} />
}
