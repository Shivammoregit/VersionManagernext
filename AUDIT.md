# Version Manager – Audit Report

Date: 2026-01-15

Scope: This report covers the Next.js “Version Manager” app (UI + API) and its Play Store/App Store scraping components, including the standalone scraping watcher script.

## System Overview

- UI: Next.js App Router client UI in `src/app/page.js`.
- Data store: MongoDB via `src/lib/mongodb.js`, storing releases in `releases` collection.
- API surface:
  - Auth: `POST /api/auth` in `src/app/api/auth/route.js`.
  - Releases CRUD: `src/app/api/releases/route.js`, `src/app/api/releases/[id]/route.js`.
  - Play Store scrape endpoints: `src/app/api/playstore/[packageId]/route.js`, `src/app/api/playstore/[packageId]/refresh/route.js`, health in `src/app/api/playstore/health/route.js`.
  - App Store scrape endpoints: `src/app/api/appstore/[appId]/route.js`, health in `src/app/api/appstore/health/route.js`.
  - Play Store sync endpoint: `src/app/api/sync/playstore/route.js` (writes store version to MongoDB).
- Scraping logic:
  - Play Store: `src/lib/playstore/scraper.js` (uses `google-play-scraper`, falls back to ds:5 HTML extraction).
  - App Store: `src/lib/appstore/scraper.js` (uses Apple iTunes Lookup API).
- Scraping-only watcher:
  - Script: `scripts/playstore-watcher.mjs`
  - Config: `config/playstore-apps.example.json`
  - State file: `data/playstore-state.json` (gitignored by `.gitignore`)

## Key Findings (Prioritized)

### 1) API Authorization is not enforced (Critical)

- The UI “auth” gate is client-side: `src/app/page.js` sets `sessionStorage` (`vm_auth`) on success but does not establish a server-side session.
- Most API routes do not check authentication/authorization at all, including release write/delete:
  - `src/app/api/releases/route.js` (POST creates/updates)
  - `src/app/api/releases/[id]/route.js` (PUT/DELETE)
- Impact:
  - If deployed publicly, anyone can modify or delete release records by calling the API directly.

Recommendations:
- Protect all mutating routes (`/api/releases*`, `/api/sync/*`, refresh endpoints) with server-side auth:
  - simplest: an API key check on the server (header-based) for all writes
  - better: cookie-based auth/session with proper password storage (hashing) and CSRF protection
- Ensure the UI auth state is derived from a server-issued session/cookie, not `sessionStorage`.

### 2) Default credentials + weak passkey handling (High)

- `src/app/api/auth/route.js` seeds a default passkey `admin123` into MongoDB if missing.
- Passkey values are stored as plaintext and compared directly.

Recommendations:
- Remove default passkey behavior; require explicit setup via environment variable or an admin bootstrap step.
- Store passkeys as hashes (e.g., bcrypt/argon2) and implement rotation.

### 3) NoSQL injection / missing input validation on release APIs (High)

- Release endpoints accept JSON values without strict type validation. Example: `app_id`, `environment` are used directly in MongoDB queries.
- An attacker can potentially send operator objects (e.g., `{ "$gt": "" }`) instead of strings.

Recommendations:
- Validate request bodies with a schema (e.g., zod) and enforce:
  - `app_id` ∈ {`ios-parent`, `ios-partner`, `android-parent`, `android-partner`}
  - `environment` ∈ {`production`, `development`}
  - `version`, `build`, `notes` are strings with length limits
- Reject non-string types early.

### 4) CORS is permissive (Medium → High depending on deployment)

- Several endpoints allow `Access-Control-Allow-Origin: *` (e.g., `src/app/api/appstore/[appId]/route.js`, Play Store health, sync).
- Combined with missing auth on write endpoints, this increases risk of cross-site abuse.

Recommendations:
- If the app is internal, restrict CORS to the dashboard’s origin (or disable CORS entirely).
- Ensure write endpoints are not callable cross-origin without authorization.

### 5) Play Store scraping reliability is fragile (Medium)

- The primary library `google-play-scraper` is used, but in practice it can throw parsing errors for these apps.
- The fallback relies on parsing Play Store HTML and extracting ds:5 metadata in `src/lib/playstore/scraper.js`.
- This fallback is intentionally “more targeted” than full-page regex scanning, but it is still coupled to Play Store’s internal page format and can break if Google changes it or returns an interstitial/anti-bot page.

Recommendations:
- Keep rate limits conservative and add monitoring/alerting on repeated failures.
- Store “last known good version” and avoid overwriting it with unknown/invalid results.
- Consider a second maintained extraction path (e.g., headless browser) only if needed and operationally acceptable.

### 6) Internal duplication/inconsistency in the Play Store module (Medium)

- `src/lib/playstore/` contains a full modular implementation (`config.js`, `cache.js`, `errors.js`, `rateLimiter.js`, `logger.js`, `validation.js`) and unit tests for those modules.
- However, `src/lib/playstore/scraper.js` is currently “self-contained” and does not use those modules consistently (e.g., separate `config`, separate cache implementation).
- Impact:
  - Test coverage may not reflect production behavior.
  - Health/config reporting can diverge from actual scraper behavior.

Recommendations:
- Consolidate to a single source of truth:
  - either refactor `scraper.js` to import and use `config.js/cache.js/errors.js/...`, or
  - remove the unused modules/tests if they are not intended to be used.

### 7) Operational gap: local-state watcher vs production deployments (Medium)

- The scraping-only watcher stores state in `data/playstore-state.json`.
- This is fine for local/VM execution, but not reliable on serverless hosts with ephemeral filesystem.

Recommendations:
- If deploying the watcher in serverless, persist state in MongoDB (or another durable store) instead of local JSON.
- If running on a VM/cron, ensure file backups and log retention.

## What Works Well

- App Store scraping is robust: `src/lib/appstore/scraper.js` uses Apple’s official iTunes API.
- Play Store endpoints have rate limiting and middleware hooks in `src/lib/playstore/middleware.js` (good foundation once auth and validation are enforced consistently).
- The watcher script supports retries/backoff, validation guardrails, and optional Slack notification.

## Suggested Remediation Plan

1. Critical: enforce server-side auth/authorization for all write operations (`/api/releases*`, `/api/sync/*`, refresh).
2. High: add strict schema validation to stop NoSQL injection and constrain allowed app/environment values.
3. High: remove default passkey and store passkeys hashed.
4. Medium: tighten CORS and add rate limiting to non-scraper endpoints.
5. Medium: unify Play Store module implementation so tests/health/config reflect runtime behavior.

