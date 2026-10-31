import data from '../data/premierLeaguePlayers.json'
import history from '../data/premierLeagueHistory.json'
import { FANTASY_LEAGUE_MAP } from '../constants/fantasyLeagues'
import FantasyLeagueView from './FantasyLeagueView'

// Lazy-loaded from App.jsx, so the league's data stays out of the main bundle.
export default function PremierLeagueFantasyView() {
  return <FantasyLeagueView league={FANTASY_LEAGUE_MAP.premierLeague} data={data} history={history} />
}
