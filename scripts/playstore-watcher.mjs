#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import gplay from 'google-play-scraper';

const SEMVER_LIKE = /^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?$/;
const TAG_LIKE = /^(?:release|v|ver|version)[-_]?\d+(?:\.\d+){1,3}(?:[-_][0-9A-Za-z.-]+)?$/i;

function nowIso() {
  return new Date().toISOString();
}

function isValidVersionString(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  return SEMVER_LIKE.test(v) || TAG_LIKE.test(v);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt, baseDelayMs, maxDelayMs) {
  const exp = baseDelayMs * Math.pow(2, attempt);
  const jitter = exp * (Math.random() * 0.4 - 0.2);
  return Math.max(0, Math.min(maxDelayMs, Math.floor(exp + jitter)));
}

async function withRetries(fn, { retries, baseDelayMs, maxDelayMs, onRetry }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn({ attempt });
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      const delay = backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      if (typeof onRetry === 'function') onRetry({ attempt, delayMs: delay, error: err });
      await sleep(delay);
    }
  }
  throw lastError;
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = filePath + '.tmp';
  const payload = JSON.stringify(data, null, 2) + '\n';
  await fs.writeFile(tmpPath, payload, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function parseArgs(argv) {
  const args = {
    config: null,
    state: null,
    once: false,
    intervalMinutes: null,
    timeoutMs: 15000,
    retries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];

    if (a === '--config') args.config = next();
    else if (a === '--state') args.state = next();
    else if (a === '--once') args.once = true;
    else if (a === '--interval-minutes') args.intervalMinutes = Number(next());
    else if (a === '--timeout-ms') args.timeoutMs = Number(next());
    else if (a === '--retries') args.retries = Number(next());
    else if (a === '--base-delay-ms') args.baseDelayMs = Number(next());
    else if (a === '--max-delay-ms') args.maxDelayMs = Number(next());
    else if (a === '--help' || a === '-h') {
      printHelpAndExit(0);
    } else {
      console.error(`[watcher] Unknown argument: ${a}`);
      printHelpAndExit(1);
    }
  }

  if (!args.config) {
    console.error('[watcher] Missing --config');
    printHelpAndExit(1);
  }

  if (!args.state) {
    args.state = 'data/playstore-state.json';
  }

  if (args.intervalMinutes !== null && (!Number.isFinite(args.intervalMinutes) || args.intervalMinutes <= 0)) {
    console.error('[watcher] --interval-minutes must be a positive number');
    process.exit(1);
  }

  return args;
}

function printHelpAndExit(code) {
  console.log(`Play Store Version Watcher (scraping-only)

Usage:
  node scripts/playstore-watcher.mjs --config config/playstore-apps.json [--state data/playstore-state.json] [--once] [--interval-minutes 30]

Options:
  --config <file>            JSON config listing apps
  --state <file>             JSON state file (default: data/playstore-state.json)
  --once                     Run one check and exit
  --interval-minutes <n>      Run in a loop every n minutes
  --timeout-ms <n>            Per-request timeout (default: 15000)
  --retries <n>               Retries for transient failures (default: 3)
  --base-delay-ms <n>         Backoff base delay (default: 1000)
  --max-delay-ms <n>          Backoff max delay (default: 30000)

Env:
  SLACK_WEBHOOK_URL           Optional Slack webhook URL for notifications
`);
  process.exit(code);
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be a JSON object');
  }
  if (!Array.isArray(config.apps) || config.apps.length === 0) {
    throw new Error('Config must include an "apps" array with at least one app');
  }
  for (const app of config.apps) {
    if (!app || typeof app !== 'object') throw new Error('Each app must be an object');
    if (!app.name || typeof app.name !== 'string') throw new Error('Each app must have a string "name"');
    if (!app.packageName || typeof app.packageName !== 'string') throw new Error('Each app must have a string "packageName"');
  }
}

async function notify(message) {
  console.log(message);

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });

    if (!res.ok) {
      console.warn(`[watcher] Slack webhook failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[watcher] Slack webhook error:', err?.message || String(err));
  }
}

async function fetchVersionPrimary({ packageName, country, language }, { timeoutMs, retries, baseDelayMs, maxDelayMs }) {
  return withRetries(
    async () => {
      const result = await Promise.race([
        gplay.app({ appId: packageName, country, lang: language }),
        (async () => {
          await sleep(timeoutMs);
          throw new Error(`timeout after ${timeoutMs}ms`);
        })(),
      ]);

      const version = result?.version ? String(result.version).trim() : '';
      return {
        version,
        raw: result,
        source: 'google-play-scraper',
      };
    },
    {
      retries,
      baseDelayMs,
      maxDelayMs,
      onRetry: ({ attempt, delayMs, error }) => {
        console.warn(`[watcher] retrying primary fetch for ${packageName} (attempt ${attempt + 1}) in ${delayMs}ms: ${error?.message || error}`);
      },
    }
  );
}

function extractDs5Data(html) {
  const re = /AF_initDataCallback\(\{key:\s*'([^']+)'[\s\S]*?data:([\s\S]*?),\s*sideChannel:/g;
  for (const m of html.matchAll(re)) {
    if (m[1] === 'ds:5') return m[2];
  }
  return null;
}

function pickBestCandidateFromDs5(ds5) {
  if (!ds5) return null;

  // Targeted attempt: find candidates near a "Version" label to avoid unrelated strings.
  const labels = ['Version', 'Current Version'];
  for (const label of labels) {
    const idx = ds5.indexOf(label);
    if (idx === -1) continue;
    const window = ds5.slice(idx, Math.min(ds5.length, idx + 2000));
    const releaseNear = window.match(/"(release-\d+\.\d+\.\d+(?:\.\d+)?)"/i);
    if (releaseNear) return releaseNear[1];
    const semverNear = window.match(/"(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?)"/);
    if (semverNear) return semverNear[1];
  }

  // Fallback: scan ds:5 ONLY for quoted, validated candidates; pick by highest frequency.
  const counts = new Map();

  const releaseRe = /"((?:release|v|ver|version)[-_]?\d+(?:\.\d+){1,3}(?:[-_][0-9A-Za-z.-]+)?)"/gi;
  const semverRe = /"(\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?)"/g;

  for (const m of ds5.matchAll(releaseRe)) {
    const v = m[1];
    if (!isValidVersionString(v)) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  for (const m of ds5.matchAll(semverRe)) {
    const v = m[1];
    if (!isValidVersionString(v)) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  if (counts.size === 0) return null;

  let best = null;
  let bestCount = -1;
  for (const [v, c] of counts.entries()) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

async function fetchVersionFallback({ packageName, country, language }, { timeoutMs, retries, baseDelayMs, maxDelayMs }) {
  return withRetries(
    async () => {
      const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&hl=${encodeURIComponent(language)}&gl=${encodeURIComponent(country)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
        });

        const html = await res.text();
        if (!res.ok) {
          throw new Error(`fallback HTTP ${res.status}`);
        }

        if (/unusual\s+traffic|automated\s+queries|\/sorry\//i.test(html)) {
          throw new Error('Play Store returned an anti-bot/interstitial page');
        }

        const ds5 = extractDs5Data(html);
        const version = pickBestCandidateFromDs5(ds5);

        return {
          version: version ? String(version).trim() : '',
          source: 'ds:5',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      retries,
      baseDelayMs,
      maxDelayMs,
      onRetry: ({ attempt, delayMs, error }) => {
        console.warn(`[watcher] retrying fallback fetch for ${packageName} (attempt ${attempt + 1}) in ${delayMs}ms: ${error?.message || error}`);
      },
    }
  );
}

async function getVersionForApp(app, defaults, retryOpts) {
  const country = (app.country || defaults.country || 'us').toLowerCase();
  const language = (app.language || defaults.language || 'en').toLowerCase();

  // 1) Prefer maintained library
  try {
    const primary = await fetchVersionPrimary({ packageName: app.packageName, country, language }, retryOpts);
    if (isValidVersionString(primary.version)) {
      return { version: primary.version, source: primary.source };
    }

    if (primary.version) {
      console.warn(`[watcher] primary returned non-validated version for ${app.packageName}: "${primary.version}"; trying fallback`);
    }
  } catch (err) {
    console.warn(`[watcher] primary failed for ${app.packageName}: ${err?.message || err}; trying fallback`);
  }

  // 2) Targeted fallback (ds:5 metadata)
  const fallback = await fetchVersionFallback({ packageName: app.packageName, country, language }, retryOpts);
  if (!isValidVersionString(fallback.version)) {
    throw new Error(`could not extract a validated version for ${app.packageName}`);
  }

  return { version: fallback.version, source: fallback.source };
}

async function runOnce(configPath, statePath, args) {
  const config = await loadJson(configPath);
  validateConfig(config);

  let state = { apps: {}, updatedAt: null };
  try {
    state = await loadJson(statePath);
  } catch {
    // first run or missing state file
  }
  if (!state.apps || typeof state.apps !== 'object') state.apps = {};

  const retryOpts = {
    retries: args.retries,
    baseDelayMs: args.baseDelayMs,
    maxDelayMs: args.maxDelayMs,
    timeoutMs: args.timeoutMs,
  };

  for (const app of config.apps) {
    const ts = nowIso();
    const key = app.packageName;
    const prev = state.apps[key] || {};

    try {
      const { version, source } = await getVersionForApp(app, config, retryOpts);

      const prevVersion = prev.lastSeenVersion || null;
      state.apps[key] = {
        name: app.name,
        packageName: app.packageName,
        lastSeenVersion: version,
        lastCheckedAt: ts,
        lastChangedAt: prevVersion && prevVersion !== version ? ts : (prev.lastChangedAt || null),
        lastSource: source,
      };

      if (!prevVersion) {
        console.log(`[watcher] ${ts} INIT ${app.name} (${app.packageName}) = ${version} [${source}]`);
      } else if (prevVersion !== version) {
        await notify(`[watcher] ${ts} UPDATE ${app.name} (${app.packageName}) ${prevVersion} -> ${version}`);
      } else {
        console.log(`[watcher] ${ts} OK ${app.name} (${app.packageName}) = ${version}`);
      }
    } catch (err) {
      state.apps[key] = {
        ...prev,
        name: app.name,
        packageName: app.packageName,
        lastCheckedAt: ts,
        lastError: err?.message || String(err),
      };
      console.warn(`[watcher] ${ts} ERROR ${app.name} (${app.packageName}): ${err?.message || err}`);
    }
  }

  state.updatedAt = nowIso();
  await writeJsonAtomic(statePath, state);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const configPath = args.config;
  const statePath = args.state;

  if (args.once || args.intervalMinutes === null) {
    await runOnce(configPath, statePath, args);
    return;
  }

  const intervalMs = Math.floor(args.intervalMinutes * 60 * 1000);
  console.log(`[watcher] starting loop: every ${args.intervalMinutes} minutes`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runOnce(configPath, statePath, args);
    await sleep(intervalMs);
  }
}

main().catch((err) => {
  console.error('[watcher] fatal:', err?.stack || err);
  process.exit(1);
});
