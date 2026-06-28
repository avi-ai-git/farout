# FAROUT — Daily Mission Briefing

> NASA's open data, turned into a daily cinematic mission briefing.

## What It Is

FAROUT is a daily space exploration app that compiles NASA's public data into one cinematic scroll. Each day it pulls the Astronomy Picture of the Day, near-Earth asteroid telemetry, full-disk Earth imagery from the DSCOVR satellite, and NASA mission archive imagery, then presents them as a structured mission briefing.

## Who It's For

Anyone who finds NASA's public data interesting but has never had a single place to experience it all at once. Space enthusiasts, students, builders, and anyone who wants to start their day with what the universe looks like right now.

## APIs Used

| API | Source | Purpose |
|-----|--------|---------|
| APOD | api.nasa.gov/planetary/apod | Daily cosmos image |
| NeoWs | api.nasa.gov/neo/rest/v1/feed | Near-Earth asteroid data |
| EPIC | api.nasa.gov/EPIC/api/natural | Full-disk Earth imagery (DSCOVR) |
| NASA Image Library | images-api.nasa.gov | Mission archive imagery |

## Features

- **Cosmos Signal** — Today's NASA Astronomy Picture of the Day with full-bleed cinematic hero
- **Today's Briefing Overview** — 4-card status panel showing live module state
- **Last 7 Signals** — Horizontal scroll of the past 7 days of APOD
- **Asteroid Watch** — Near-Earth object data: count, closest approach, miss distance in km and lunar distances, hazard status with calm explanation
- **Earth Pulse** — Full-disk Earth photo from NASA's EPIC camera on the DSCOVR satellite
- **Planetary Archive** — NASA Image Library search by rotating theme
- **Mission Brief Card** — Compiled daily summary with one-click copy for LinkedIn and X
- **Demo Mode** — Guided presentation mode for screen recording with captions, auto-advance, and keyboard controls
- **Mission Control view** — Terminal-style secondary view with CRT scanlines
- **Web Audio ambience** — Subtle sub-bass drone (user-activated)
- **Custom reticle** — Parallax cursor with coordinate display
- **Lightbox** — Click any image for full metadata view
- **Date picker** — Browse any past date

## Architecture

```
├── public/index.html     Full FAROUT frontend (vanilla HTML/CSS/JS)
└── api/                  Vercel serverless functions — NASA API proxy
    ├── apod.ts           Astronomy Picture of the Day
    ├── apod-range.ts     APOD range (Last 7 Signals)
    ├── asteroids.ts      NeoWs near-Earth objects
    ├── library.ts        NASA Image Library search
    └── epic.ts           DSCOVR EPIC full-disk Earth imagery
```

The serverless functions act as a secure proxy — all NASA API calls are made server-side. The NASA API key lives in a Vercel encrypted environment variable and never reaches the browser.

## How to Run Locally

```bash
npm install -g vercel
vercel dev
```

`vercel dev` runs the static frontend and the `/api/*` functions together at `http://localhost:3000`. It also reads environment variables you've set on the linked Vercel project.

## Configuring NASA_API_KEY

1. Go to [api.nasa.gov](https://api.nasa.gov) and get a free API key.
2. Set it as an environment variable on Vercel:
   ```bash
   vercel env add NASA_API_KEY production
   vercel env add NASA_API_KEY preview
   vercel env add NASA_API_KEY development
   ```
3. Redeploy: `vercel --prod`.

The app works with NASA's `DEMO_KEY` but rate limits apply (30 requests/hour).

## What Was Built During the Buildathon

I brought in the FAROUT design system, visual direction, NASA open-data concept, and a basic HTML structure. Replit Agent helped turn that into a secure, live, guided space exhibition app by:

- Creating secure NASA API proxy routes
- Moving API key handling into encrypted server-side environment variables
- Adding Asteroid Watch using NASA NeoWs
- Adding Earth Pulse using NASA EPIC
- Adding a structured daily mission briefing journey
- Adding Mission Brief Card with copy-to-clipboard social posts
- Adding Demo Mode for buildathon video recording
- Filling the Build Log with real development history

The app was later migrated from a Replit-hosted Express + pnpm-monorepo setup to a flat Vercel deployment (static frontend + serverless functions) without changing any user-facing behavior.

## Known Limitations

- EPIC imagery is typically 1–3 days behind the current date (NASA processing delay). When the selected date has no capture yet, Earth Pulse walks back up to 7 days to the nearest available image and labels the delta in the caption.
- NASA DEMO_KEY is rate-limited to 30 requests/hour
- The app is frontend-only — no database, no user accounts
- Mission Brief Card is text-only (no image export)

## Future Roadmap

- Mission Brief Card image export (canvas-based)
- Mars surface imagery via NASA Mars Rovers API
- ISS current position overlay
- Notification mode: "something unusual is happening today"
