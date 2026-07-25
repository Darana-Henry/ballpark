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

## Key Commands

```bash
npm run dev          # Local dev server at http://localhost:5173/ballpark/
npm run build        # Production build to dist/
npm run deploy       # Build + push to GitHub Pages
```
