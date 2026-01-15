# Play Store Version Scraper Module

A secure, production-ready module for fetching Android app version information from the Google Play Store.

## Features

- ✅ Fetch current app version from Play Store
- ✅ Configurable caching with 1-hour default TTL
- ✅ Sliding window rate limiting (10 req/min default)
- ✅ Exponential backoff retry logic
- ✅ Comprehensive input validation
- ✅ Custom error classes with safe user messages
- ✅ Optional API key authentication
- ✅ Per-IP rate limiting
- ✅ Pluggable cache backend (Redis-ready)
- ✅ Monitoring hooks support
- ✅ Health check endpoint
- ✅ TypeScript-compatible JSDoc comments

## Quick Start

### Programmatic Usage

```javascript
import { getVersion, PlayStoreScraper } from '@/lib/playstore';

// Simple usage with default scraper
const info = await getVersion('com.google.android.apps.maps');
console.log(`Version: ${info.version}`);

// Custom configuration
const scraper = new PlayStoreScraper({
  timeout: 15000,
  maxRetries: 5,
  country: 'uk',
});
const result = await scraper.getVersion('com.example.app');
```

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/playstore/{packageId}` | GET | Fetch version info |
| `/api/playstore/{packageId}/refresh` | POST | Force refresh cache |
| `/api/playstore/health` | GET | Health check |

## API Reference

### GET /api/playstore/{packageId}

Fetches version information for an Android app.

**Request:**
```bash
curl http://localhost:3000/api/playstore/com.google.android.apps.maps
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "packageId": "com.google.android.apps.maps",
    "version": "11.58.0",
    "lastUpdated": "2024-01-10T00:00:00.000Z",
    "fetchedAt": "2024-01-12T09:51:10.000Z",
    "fromCache": true,
    "cacheExpiresIn": 3542
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid package ID format. Must be like \"com.example.app\""
  }
}
```

### POST /api/playstore/{packageId}/refresh

Forces a cache refresh for the specified app.

```bash
curl -X POST http://localhost:3000/api/playstore/com.google.android.apps.maps/refresh
```

### GET /api/playstore/health

Returns health status with cache and rate limit statistics.

```bash
curl http://localhost:3000/api/playstore/health
```

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PLAYSTORE_CACHE_TTL_MS` | `3600000` | Cache TTL (1 hour) |
| `PLAYSTORE_MAX_CACHE_SIZE` | `1000` | Max cache entries |
| `PLAYSTORE_RATE_LIMIT` | `30` | Requests per window |
| `PLAYSTORE_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (1 min) |
| `PLAYSTORE_LOG_LEVEL` | `info` | debug/info/warn/error |
| `PLAYSTORE_API_KEY` | - | Optional API key |
| `PLAYSTORE_REQUEST_TIMEOUT_MS` | `30000` | Request timeout |
| `PLAYSTORE_MAX_RETRIES` | `3` | Max retry attempts |

## Error Handling

All errors extend `PlayStoreError` and include:

- `code` - Machine-readable error code
- `userMessage` - Safe message for end users
- `statusCode` - HTTP status code
- `toSafeResponse()` - Returns safe JSON for API responses

Error Types:
- `ValidationError` (400) - Invalid input
- `AuthenticationError` (401) - Invalid API key
- `NotFoundError` (404) - App not found
- `RateLimitError` (429) - Rate limit exceeded
- `TimeoutError` (504) - Request timeout
- `NetworkError` (503) - Network issues
- `ServiceUnavailableError` (503) - Play Store unavailable

## Security Features

1. **Input Validation** - Package IDs validated with regex
2. **Injection Prevention** - XSS, SQL injection, path traversal blocked
3. **Rate Limiting** - Per-IP sliding window algorithm
4. **Timing-Safe Auth** - API key comparison prevents timing attacks
5. **Safe Error Messages** - Internal details never exposed
6. **Security Headers** - X-Content-Type-Options, X-Frame-Options, etc.

## Architecture

```
src/lib/playstore/
├── index.js          # Main exports
├── config.js         # Environment configuration
├── scraper.js        # Core scraper service
├── cache.js          # In-memory/Redis cache
├── rateLimiter.js    # Sliding window rate limiter
├── validation.js     # Input validation
├── errors.js         # Custom error classes
├── logger.js         # Structured logging
├── middleware.js     # API middleware
└── __tests__/        # Unit tests
```

## Troubleshooting

### "Rate limit exceeded" (429)

- Default: 10 requests per minute
- Wait for the time indicated in `Retry-After` header
- Increase `PLAYSTORE_RATE_LIMIT` if needed

### "App not found" (404)

- Verify package ID format: `com.company.appname`
- Check if app exists on Play Store in the configured country

### "Request timeout" (504)

- Default timeout is 30 seconds
- Increase `PLAYSTORE_REQUEST_TIMEOUT_MS` for slow connections
- Check network connectivity

### Cache not working

- Check `PLAYSTORE_CACHE_TTL_MS` is > 0
- Look for `X-Cache` header in responses (HIT/MISS)
- Use health endpoint to check cache statistics
