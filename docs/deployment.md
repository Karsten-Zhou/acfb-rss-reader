# Deployment

The whole app deploys as **one Cloudflare Worker** that serves both the API and
the built Vue SPA (Workers Assets).

## Prerequisites

- A Cloudflare account with Workers enabled.
- A GitHub OAuth App (Settings -> Developer settings -> OAuth Apps) with:
  - Homepage URL: `https://<your-worker>.workers.dev`
  - Authorization callback URL: `https://<your-worker>.workers.dev/api/auth/callback`
- Your GitHub user ID. The app matches the **numeric** GitHub user ID, so a
  username won't work. The easiest way to get yours (no authentication
  needed): open `https://api.github.com/users/<your-username>` in a browser —
  the `"id"` field in the JSON is your numeric user ID.

## One-time setup

```sh
# 1. Install dependencies
bun install

# 2. Create the D1 database (from apps/worker)
cd apps/worker
bunx wrangler d1 create rss-reader-db

# 3. Copy the returned database_id into apps/worker/wrangler.jsonc
#    and into .dev.vars for local development.

# 4. Create the KV namespace
bunx wrangler kv namespace create KV_STORE
#    Copy the returned id into wrangler.jsonc and .dev.vars.

# 5. Set secrets
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET
bunx wrangler secret put ALLOWED_GITHUB_USER_ID
bunx wrangler secret put APP_ORIGIN   # e.g. https://your-worker.workers.dev

# 6. Apply database migrations
bunx wrangler d1 migrations apply rss-reader-db --remote
```

## Local development

```sh
bun run dev
# web: http://localhost:5173  (proxies /api -> 8787)
# worker: http://localhost:8787
```

For local OAuth, create `apps/worker/.dev.vars` (see `docs/environment.md`)
and set `APP_ORIGIN=http://localhost:5173`. Note that GitHub OAuth requires a
public redirect URL — for local testing use a Cloudflare tunnel or a
temporary public URL.

## Deploy

```sh
bun run deploy
```

This builds the web SPA and the Worker, then runs `wrangler deploy`.

## CI/CD

Optional: GitHub Actions with `cloudflare/wrangler-action`, or Cloudflare
Workers Builds (git integration). See
https://developers.cloudflare.com/workers/ci-cd/.
