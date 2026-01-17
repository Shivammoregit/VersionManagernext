# Version Manager (Next.js)
A full-stack version management dashboard built with Next.js and MongoDB.

## Prerequisites
- Node.js (v18 or higher)
- MongoDB Database (Local or Atlas)

## Setup
**Install Dependencies**
   ```bash
   npm install
```
>
> - **Tech Stack:** **Next.js**.
> - **Architecture:** It is a single full-stack application (Frontend + API in one project).
> - **Database:** Connected to MongoDB (requires connection string).
>
> **Deployment Instructions:**
> 1. Pull the latest code from the `main` branch.
> 2. Set the `MONGODB_URI` environment variable in  **.env.local** ` (version-manager-next\.env.local) `
> 3. Use the standard Next.js build command: `npm run build` and start command: `npm start`.
>
> Best,
> Shivam-More

## Play Store Auto-Sync (Android)

This project scrapes Play Store versions for:
- PetYosa Android: `com.petyosa.petapp`
- VetYosa Android: `com.petyosa.vetapp`

**Fetch only (no DB write):**
- `GET /api/playstore/{packageId}`

**Sync into MongoDB (updates `releases` production):**
- `GET /api/sync/playstore`
- `POST /api/sync/playstore`

If `PLAYSTORE_API_KEY` is set, you must provide it either:
- As a header: `x-api-key: YOUR_KEY` (or the header name set in `PLAYSTORE_API_KEY_HEADER`)
- Or as a query param: `?key=...` (useful for cron)

Example:
- `GET /api/sync/playstore?key=YOUR_KEY`

To keep versions updated automatically, run this endpoint on a schedule (cron/Task Scheduler/Vercel Cron).

Examples:
- Linux cron (every 30 min):
  - `*/30 * * * * curl -fsS 'https://YOUR_DOMAIN/api/sync/playstore?key=YOUR_KEY' > /dev/null`
- Windows Task Scheduler (PowerShell action):
  - `powershell -NoProfile -Command "Invoke-RestMethod 'https://YOUR_DOMAIN/api/sync/playstore?key=YOUR_KEY' | Out-Null"`

## App Store Auto-Sync (iOS)

This project fetches App Store versions (and "What's New"/release notes) for:
- PetYosa iOS: `6756305494`
- VetYosa iOS: `6756630090`

**Fetch only (no DB write):**
- `GET /api/appstore/{appId}`

**Sync into MongoDB (updates `releases` production, including `notes`):**
- `GET /api/sync/appstore`
- `POST /api/sync/appstore`

If `APPSTORE_API_KEY` is set, you must provide it either:
- As a header: `x-api-key: YOUR_KEY` (or the header name set in `APPSTORE_API_KEY_HEADER`)
- Or as a query param: `?key=...` (useful for cron)

Example:
- `GET /api/sync/appstore?key=YOUR_KEY`

## Play Store Version Watcher (Scraping-Only)

This is a standalone script that scrapes the Play Store **Version** field for configured Android apps and logs when it changes.

### Configure

Copy the example config and edit as needed:
- `config/playstore-apps.example.json`
- Copy to: `config/playstore-apps.json`

### Run once

- `npm run watch:playstore`

### Run in a loop (every 30 minutes)

- `npm run watch:playstore:loop`

### State file

The watcher stores last-seen versions in `data/playstore-state.json` (gitignored).

### Optional Slack notifications

Set `SLACK_WEBHOOK_URL` to post update messages to Slack.

