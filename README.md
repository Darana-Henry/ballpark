# Ballpark 🏟️

A personal sports tracker for following live scores, results, and watched game history across five leagues.

## Stack

- **React 19** + **Vite 8** — fast dev server and optimised builds
- **Tailwind CSS v4** — CSS-first config via `@import "tailwindcss"`
- **Firebase Firestore** — real-time watched game sync
- **Firebase Authentication** — Google Sign-In, single-user access
- **gh-pages** — deploys to GitHub Pages

## Leagues

| League | Scope | Data Source |
|--------|-------|-------------|
| MLB ⚾ | Dodgers + all playoffs | MLB Stats API |
| NBA 🏀 | Lakers + all playoffs | ESPN API |
| NFL 🏈 | All teams + playoffs | ESPN API |
| BBL 🏏 | All games + playoffs | CricAPI |
| MLS ⚽ | All games | ESPN API |

## Features

- Live scores, schedules, and results per league
- Mark games as watched — synced to Firestore in real-time
- Stats dashboard with per-league watched counts and W/L records
- Home view aggregating live and upcoming games across all leagues
- Responsive: sidebar on desktop, bottom tab bar on mobile

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Firebase

Copy `.env.example` to `.env.qa` and fill in your Firebase project credentials:

```bash
cp .env.example .env.qa
```

Get the values from **Firebase Console → Project Settings → Your apps**.

### 3. Configure Firebase Authentication

In the Firebase Console:
- Enable **Authentication → Google** sign-in provider
- Add your GitHub Pages domain to **Authorized domains**

### 4. Set Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5. Run locally

```bash
npm run dev
# → http://localhost:5173/ballpark/
```

## Deployment

```bash
npm run deploy
```

Builds and pushes to the `gh-pages` branch. Make sure `homepage` in `package.json` points to your GitHub Pages URL before deploying.

## Project Structure

```
src/
  App.jsx                  Main layout + routing
  firebase.js              Firebase init (credentials via env vars)
  api/
    mlb.js                 MLB Stats API
    espn.js                ESPN — NBA, NFL, MLS
    bbl.js                 CricAPI — BBL
  components/
    AuthGate.jsx           Google Sign-In gate, wraps the entire app
    GameCard.jsx           Score card with watched toggle
    Sidebar.jsx            Desktop navigation
    MobileNav.jsx          Mobile bottom tab bar
  views/
    HomeView.jsx           Live + upcoming games across all leagues
    MLBView.jsx
    NBAView.jsx
    NFLView.jsx
    BBLView.jsx
    MLSView.jsx
    StatsView.jsx          Watched counts + W/L records
  hooks/
    useWatchedGames.js     Firestore real-time sync + toggle
  contexts/
    WatchedContext.jsx     React context for watched state
```
