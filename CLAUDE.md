# Ballpark — Sports Tracker

Personal sports tracker web app. React + Tailwind + Firebase Firestore, deployed to GitHub Pages.

## Stack
- **React 19** + **Vite 8** — `npm run dev` to start, `npm run deploy` to push to GitHub Pages
- **Tailwind CSS v4** — CSS-first config via `@import "tailwindcss"` in `src/index.css`; plugin added in `vite.config.js`
- **Firebase Firestore** — credentials in `src/firebase.js` (user fills in their own)
- **gh-pages** — `npm run deploy` builds and pushes to the `gh-pages` branch

## Leagues Tracked

| League | Scope | Data Source | Team IDs |
|--------|-------|-------------|----------|
| MLB ⚾ | LA Dodgers (ID 119) + all playoffs | `https://statsapi.mlb.com/api/v1` | Dodgers: 119 |
| NBA 🏀 | LA Lakers + all playoffs | ESPN: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba` | Lakers ESPN ID: 13 |
| NFL 🏈 | All games + all playoffs | ESPN: `https://site.api.espn.com/apis/site/v2/sports/football/nfl` | All teams |
| BBL 🏏 | All games + playoffs | CricAPI (free key, user provides) | — |

## File Structure

```
src/
  App.jsx                     Main layout — sidebar + routing + Firebase banner
  firebase.js                 Firebase init (user fills credentials here)
  main.jsx                    Entry point
  index.css                   Tailwind + dark theme base styles
  constants/
    leagues.js                League config: id, name, emoji, colors, Tailwind classes
  contexts/
    WatchedContext.jsx         React context wrapping useWatchedGames hook
  hooks/
    useWatchedGames.js         Firestore real-time onSnapshot + toggleWatched
  api/
    mlb.js                    MLB Stats API — fetchMLBGames() → normalized Game[]
    espn.js                   ESPN API — fetchNBAGames(), fetchNFLGames()
  components/
    Sidebar.jsx                Desktop left sidebar navigation
    MobileNav.jsx              Mobile bottom tab bar
    GameCard.jsx               Game card: teams, score, status, highlight link, watched toggle
    LoadingSpinner.jsx
    EmptyState.jsx
  views/
    MLBView.jsx                MLB tab — filters: Recent/All/Playoffs
    NBAView.jsx                NBA tab
    NFLView.jsx                NFL tab — fetches all 18 regular + 5 playoff weeks in parallel
    BBLView.jsx                BBL placeholder — prompts for CricAPI key, stores in localStorage
    StatsView.jsx              Stats dashboard — per-league watched counts + W/L records
```

## Normalized Game Object

All API modules normalize to this shape:
```js
{
  id: string,
  league: 'mlb' | 'nba' | 'nfl' | 'bbl',
  homeTeam: { id, name, abbreviation, logo },
  awayTeam: { id, name, abbreviation, logo },
  homeScore: number | null,          // null if not started
  awayScore: number | null,
  status: 'scheduled' | 'live' | 'final',
  statusDetail: string,              // "Final", "Top 5th", "7:05 PM ET"
  gameDate: Date,
  gameType: string,                  // "Regular Season", "Wild Card", etc.
  highlightUrl: string | null,       // MLB recap or ESPN game page
  venue: string | null,
}
```

## Firestore Structure

Collection: `watchedGames`
Document ID: `{league}_{gameId}` (e.g. `mlb_778556`)
Fields: `{ watched, league, gameId, homeTeam, awayTeam, homeTeamId, awayTeamId, homeScore, awayScore, statusDetail, gameDate, status, gameType, updatedAt }`

Collection: `matchdayProgress` (Europe tab)
Document ID: `{competition}_{season}` (e.g. `ucl_2026`)
Fields: `{ competition, season, watchedThrough, updatedAt }` — last league-phase matchday marked watched; later matchdays are spoiler-locked

Firestore rules should allow read/write (personal use, no auth):
```
match /{document=**} { allow read, write: if true; }
```

## GitHub Pages Deployment

1. Set `homepage` in `package.json` to `https://YOUR_USERNAME.github.io/ballpark`
2. `vite.config.js` already sets `base: '/ballpark/'`
3. Run `npm run deploy` — builds and pushes to `gh-pages` branch

## Design

- **Dark theme** — primary bg `#0d0d14`, sidebar `#111118`, cards `#161622`
- **League accent colors**: MLB=blue-500, NBA=purple-500, NFL=emerald-500, BBL=amber-500
- **Watched card style**: green border glow + dark green tint (`.watched-card` CSS class)
- **Mobile**: bottom tab bar; **Desktop**: 240px left sidebar
- All logos loaded directly from MLB static CDN (`https://www.mlbstatic.com/team-logos/{id}.svg`) and ESPN API responses

## Adding BBL Support

When the user provides their CricAPI key:
1. Add `src/api/bbl.js` using `https://api.cricapi.com/v1/cricScore?apikey={key}`
2. Normalize to the same Game shape above
3. Update `BBLView.jsx` to call the API once the key is in localStorage
4. Match BBL on team names (no numeric IDs in CricAPI)

## Fantasy Deadlines

`scripts/fetch-fantasy-deadlines.mjs` (`npm run fantasy:deadlines`) runs in the deploy workflow every 6 hours and writes:
- `src/data/fantasyDeadlines.json`: every round's deadline, imported by the Deadlines tab and Home strip (committed as the fallback when a source is down)
- `public/fantasy-deadlines.ics`: subscribable calendar, gitignored; each event runs from 1 hour before a deadline to the deadline

Sources: Premier League, Eliteserien and Allsvenskan fantasy expose official deadlines at `/api/bootstrap-static/` on their fantasy domains. Bundesliga, Serie A and Champions League fantasy lock 5 minutes before the matchday's first kickoff, computed from ESPN fixtures (UEFA's fantasy site blocks non-browser clients). None allow browser CORS, so nothing here is fetched client-side.

## Europe Tab: Premier League Gameweeks

ESPN has no gameweek field, so `scripts/fetch-pl-gameweeks.mjs` (`npm run pl:gameweeks`, in the deploy workflow) maps every ESPN Premier League match id to its official FPL gameweek in `src/data/plGameweeks.json` (committed as the fallback). Teams are paired across the two sources by their sets of kickoff times, not by name. Serie A and the Bundesliga have no official round feed, so `groupByTeamRounds` in `src/utils/leaguePhase.js` puts each fixture in the earliest round neither team has played (a postponed match keeps its original round). Per-competition differences (zones, tag thresholds, tiebreakers, round wording) live in rules objects in `src/utils/leaguePhase.js`.

## Fantasy League Tabs (Premier League, Eliteserien, Allsvenskan)

All three games run on the Premier League's fantasy platform, so one script and one set of panels serve them all. `scripts/fetch-fantasy-players.mjs <league>` (`npm run fpl:players`, `npm run eliteserien:players`, `npm run allsvenskan:players`, all in the deploy workflow) writes `src/data/<league>Players.json` (league keys `premierLeague`, `eliteserien`, `allsvenskan`; committed as the fallback). Per-league settings (API, ESPN slug, Transfermarkt path, the user's entry id, the overall league id, the season's months, whether to write the Europe round map) are in its `LEAGUES` table. Seasons are named as the games name past seasons: `2026` for the Nordic leagues (March–December), `2026/27` for the Premier League (August–May). The file holds every player's points and minutes per finished fantasy round (event ids 1–30, not league round numbers), plus:
- `penalties` `{ taken, scored, last }` from ESPN (`eng.1`, `nor.1`, `swe.1`) match `keyEvents` (`penalty---saved` names the goalkeeper, so it's skipped)
- `absence` (injury/suspension) and `yellowCards` (one booking from a ban) from Transfermarkt's `.co.in` mirror (`.com` doesn't answer scripted requests; Sofascore returns 403). Its tables are found by heading ("injured players", "Suspensions", "Risk of suspension"), not position: an empty list has no table at all
- `mySquad`: the user's picks for the latest round past its deadline. `entryId` is the number in `<game site>/entry/<id>/history` and is new every season, so update it in `LEAGUES` (or set `PREMIERLEAGUE_ENTRY_ID` / `ELITESERIEN_ENTRY_ID` / `ALLSVENSKAN_ENTRY_ID`) when a season starts. Also `bank`, `chipsUsed`, points per round and an estimated `freeTransfers` (replayed from the history: +1 a round up to the cap, none used or gained in transfer-chip rounds, a rule checked against 200 top FPL managers' hits as well as the user's; the script logs any round where the replay disagrees with the hit actually paid). Each pick's `purchasePrice` is the cost of its latest transfer in, skipping one-round chips (every `chip_type: transfer` chip but the wildcard: `freehit`, `rich`, Allsvenskan's `uteam`), else the start price
- `rules`: squad limit, sell-on fee, free-transfer cap and the game's chip windows with their `chip_type`
- `fixtures`: every fixture from the game's `/fixtures/` feed (round, kickoff, scores once finished); `teams` is filtered to clubs with fixtures, since the games also list clubs outside the league
- `topManagers`: the overall league's (FPL "Overall" 314, Eliteserien "Totalt" 329, Allsvenskan "Placering" 315) top 50 squads and captains for the same round as `mySquad`

Names are matched across sources by normalized given name + surname word, with club as tiebreaker. If one source fails, its part is carried over from the existing JSON. Status = official fantasy `status`, with Transfermarkt filling absences the game hasn't flagged.

`src/views/FantasyLeagueView.jsx` is the shared tab; `PremierLeagueFantasyView.jsx` (view id `fpl`; `epl` is the Man United tab), `EliteserienFantasyView.jsx` and `AllsvenskanFantasyView.jsx` only import their league's two data files and are lazy-loaded in `App.jsx`, so no league's data is in the main bundle. The league's data reaches every panel through `src/contexts/fantasyData.js` (`useFantasyData`; `perLeague` caches each panel's derived tables per data file). Panels, all in `src/components/Fantasy*.jsx`: Players (form windows from `src/utils/fantasyPlayers.js`, team position, next 3 fixtures), My team (pitch view of the suggested XI, bench order and captain for the round after `mySquad.round`, from `src/utils/fantasyLineup.js`: form × fixture × the game's `chance` of playing), Transfers & chips (`src/utils/fantasyPlanner.js`: a greedy 1–5 transfer plan over the next 3 rounds scored as best XI + captain, within budget, sell-on fee and the 3-per-club limit; dead weight; per-chip advice from `rules.chips`; chip labels and effects in its `CHIPS` table, effects per fan guides since the feeds don't describe them, `uteam`'s unconfirmed), Best by club (the user's Eliteserien sheet's "The Best Lads": each club's top two scorers per position over the season or last 7/4 rounds, in green when above the average best player), Fixtures, Top managers and Performance (this season against the previous one round by round, and every season's final rank).

The games publish no difficulty ratings, so `src/utils/fantasyFixtures.js` rates each fixture 1–5 from the opponent's points per game (half season, half at that venue) on fixed cut-offs, and builds the league table with `buildTable` and the shared `NORDIC_LEAGUE` rules from `leaguePhase.js`.

`src/data/<league>History.json` is the user's season archive and the only data that is **not** regenerated from scratch: past seasons' totals/final ranks come from the game's `history.past`, but round-by-round data only exists for the current entry id, so each season's finished rounds are appended under its year and never dropped (Eliteserien 2025 rounds 1–27 were imported from the user's sheet; Allsvenskan has rounds from 2026 on). The script refuses to write it when the entry's past seasons don't match the archive (an id left over from last season belongs to someone else), and only rewrites it when a round finishes. The deploy workflow's last step commits the archives back to `main` (hence `contents: write`).

For the Nordic leagues the script also writes `src/data/<league>Rounds.json` (ESPN match id → fantasy round, teams paired by kickoff times via `scripts/lib/matchTeamsByKickoff.mjs`, shared with the PL script) for the Europe tab's Eliteserien and Allsvenskan views (the Premier League's comes from `scripts/fetch-pl-gameweeks.mjs`). Like every Europe competition they're watched round by round: tables and scores lock until the previous round is marked watched, and they have a season battery (`spoilerFree: true` on a competition would turn that off).

## Key Commands

```bash
npm run dev          # Local dev server at http://localhost:5173/ballpark/
npm run build        # Production build to dist/
npm run deploy       # Build + push to GitHub Pages
```
