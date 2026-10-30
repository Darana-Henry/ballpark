import data from '../data/allsvenskanPlayers.json'
import history from '../data/allsvenskanHistory.json'
import { FANTASY_LEAGUE_MAP } from '../constants/fantasyLeagues'
import FantasyLeagueView from './FantasyLeagueView'

// Lazy-loaded from App.jsx, so the league's data stays out of the main bundle.
export default function AllsvenskanFantasyView() {
  return <FantasyLeagueView league={FANTASY_LEAGUE_MAP.allsvenskan} data={data} history={history} />
}
