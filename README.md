# cloudflare-based-rss-reader

A **personal, single-user RSS reader** that runs entirely on Cloudflare's
serverless platform. Not a SaaS — one user, self-hosted on Cloudflare
(Workers, D1, KV, Workflows, Cron Triggers, Workers Assets).

## Features

- **Feeds**: RSS, Atom, and JSON Feed subscriptions; folders; unread counts;
  feed health tracking; manual + automatic refresh.
- **Reader**: read/unread, starred (saved / read later), archived, full-text
  search (SQLite FTS5), site compatibility CSS (Steam first).
- **Auth**: GitHub OAuth, single allowed user, HttpOnly session cookies.
- **Background processing**: Cloudflare Workflows refresh feeds with retries;
  a Cron Trigger runs every 30 minutes.
- **Fetching**: conditional requests (ETag / Last-Modified), timeouts,
  exponential-backoff retries, stale-cache fallback, redirect detection.
- **UX**: dark-first Vue 3 SPA with a three-column layout, keyboard-friendly
  navigation, mobile responsive, virtualized lists.

## Architecture

```
Browser (Vue 3 SPA) ──/api/*──► Cloudflare Worker (Hono)
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
                   D1 (SQLite)   KV (cache)   Workflows (refresh)
                                               ▲
                                               │ Cron Trigger (every 30 min)
```

One Worker serves both the API and the built SPA (Workers Assets). The app is
a single Vite project using the Cloudflare Vite plugin — one dev server, one
build, one deploy. Same-origin cookies, no CORS.

```
apps/
  worker/     # Single Vite app (Cloudflare Vite plugin)
    src/      # Vue 3 SPA (shadcn-vue, Tailwind, Pinia, TanStack Query)
    server/   # Cloudflare Worker: Hono API entry + refresh Workflow
    public/   # SPA static assets (favicon, manifest)
packages/
  api/            # Hono application (routes, middleware, GitHub OAuth)
  compatibility/  # Site compatibility modules (Steam first)
  config/         # Shared tsconfig bases
  database/       # Drizzle schema, migrations, D1 client, FTS5 search
  feeds/          # Feed fetch, parse, normalize, ingest, refresh
  shared/         # Zod schemas, shared types, constants, utilities
  ui/             # Shared Vue components (empty until shared UI is extracted)
```

## Quick start

```sh
bun install
bun run dev          # SPA + Worker API on http://localhost:8787 (one server)
bun run typecheck
bun run lint
bun run test
```

You must configure local secrets first — copy `apps/worker/.dev.vars.example`
to `apps/worker/.dev.vars` and fill in your GitHub OAuth credentials and
`ALLOWED_GITHUB_USER_ID`. See `docs/environment.md` and `docs/deployment.md`.

## Deployment

```sh
bun run deploy       # builds web + worker, then `wrangler deploy`
```

Full instructions (D1/KV creation, secrets, migrations) in
`docs/deployment.md`.

## Documentation

- `docs/architecture.md` — design decisions and data model
- `docs/deployment.md` — Cloudflare setup + deploy steps
- `docs/environment.md` — env vars and secrets
- `AGENTS.md` — guidance for AI coding agents
