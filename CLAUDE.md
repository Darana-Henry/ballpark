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

ESPN has no gameweek field, so `scripts/fetch-pl-gameweeks.mjs` (`npm run pl:gameweeks`, in the deploy workflow) maps every ESPN Premier League match id to its official FPL gameweek in `src/data/plGameweeks.json` (committed as the fallback). Teams are paired across the two sources by their sets of kickoff times, not by name. Per-competition differences (zones, tag thresholds, tiebreakers, round wording) live in rules objects in `src/utils/leaguePhase.js`.

## Eliteserien Fantasy Tab

`scripts/fetch-eliteserien-players.mjs` (`npm run eliteserien:players`, in the deploy workflow) writes `src/data/eliteserienPlayers.json` (committed as the fallback): every player's points and minutes per finished fantasy round (event ids 1–30, not league round numbers), plus:
- `penalties` `{ taken, scored, last }` from ESPN `nor.1` match `keyEvents` (`penalty---saved` names the goalkeeper, so it's skipped)
- `absence` (injury/suspension) and `yellowCards` (one booking from a ban) from Transfermarkt's `.co.in` mirror (`.com` doesn't answer scripted requests; Sofascore returns 403)
- `mySquad`: the user's picks (entry `MY_ENTRY_ID`, public; the number in `fantasy.eliteserien.no/entry/<id>/history`, new every season, so update it or set `ELITESERIEN_ENTRY_ID` when a season starts) for the latest round past its deadline, plus `bank`, `chipsUsed`, points per round and an estimated `freeTransfers` (replayed from the history: +1 a round up to the cap, none used or gained in wildcard/rich rounds; the script logs any round where the replay disagrees with the hit actually paid); each pick's `purchasePrice` is the cost of its latest transfer in (skipping `rich`/`freehit` rounds, whose squads revert), else the start price

- `fixtures`: every fixture from the game's `/fixtures/` feed (round, kickoff, scores once finished); `teams` is filtered to clubs with fixtures, since the game also lists clubs outside the league
- `topManagers`: the overall league's ("Totalt", id 329) top 50 squads and captains for the same round as `mySquad`

Names are matched across sources by normalized given name + surname word, with club as tiebreaker. If one source fails, its part is carried over from the existing JSON. The view is lazy-loaded in `App.jsx` so the data stays out of the main bundle; form windows (season, last 7, last 4) live in `src/utils/fantasyPlayers.js`. Status = official fantasy `status`, with Transfermarkt filling absences the game hasn't flagged.

The view has seven panels: Players, My team (`src/components/EliteserienMyTeam.jsx`: pitch view of the suggested XI, bench order and captain for the round after `mySquad.round`, from `src/utils/fantasyLineup.js`: form × fixture × the game's `chance` of playing), Transfers & chips (`src/components/EliteserienPlanner.jsx` on `src/utils/fantasyPlanner.js`: a greedy 1–5 transfer plan over the next 3 rounds scored as best XI + captain, within budget, sell-on fee and the 3-per-club limit; dead weight; and per-chip advice from `rules.chips`, the game's chip windows), Best by club (`src/components/EliteserienBestLads.jsx`: the user's sheet's "The Best Lads" tabs, each club's top two scorers per position over the season or last 7/4 rounds, in green when above the average best player, plus the average best player per position), Fixtures (`src/components/EliteserienFixtures.jsx`), Top managers (`src/components/EliteserienTopManagers.jsx`) and Performance (`src/components/EliteserienPerformance.jsx`: this season against the previous one round by round, and every season's final rank).

`src/data/eliteserienHistory.json` is the user's season archive and the one data file that is **not** regenerated from scratch: past seasons' totals/final ranks come from the game's `history.past`, but round-by-round data only exists for the current entry id, so each season's finished rounds are appended under its year and never dropped (2025 rounds 1–27 were imported from the user's sheet). The script refuses to write it when the entry's past seasons don't match the archive (an id left over from last season belongs to someone else), and only rewrites it when a round finishes. The deploy workflow's last step commits it back to `main` (hence `contents: write`). The game publishes no difficulty ratings, so `src/utils/fantasyFixtures.js` rates each fixture 1–5 from the opponent's points per game (half season, half at that venue) on fixed cut-offs, and builds the league table with `buildTable` from `leaguePhase.js`. The Players panel ends with each player's team's next 3 rounds and their average rating (same `FixtureCell` as the Fixtures panel).

The same script writes `src/data/eliteserienRounds.json` (ESPN `nor.1` match id → fantasy round, teams paired by kickoff times via `scripts/lib/matchTeamsByKickoff.mjs`, shared with the PL script) for the Europe tab's Eliteserien view. That competition is `spoilerFree`: it's followed for fantasy, not watched, so its table and scores are never locked and it has no season battery.

## Key Commands

```bash
npm run dev          # Local dev server at http://localhost:5173/ballpark/
npm run build        # Production build to dist/
npm run deploy       # Build + push to GitHub Pages
```
