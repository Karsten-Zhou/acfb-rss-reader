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
- **Settings**: theme (light / dark / system) and interface language
  (English / Deutsch / 中文), both persisted to the backend; an About screen
  with version, build time, and a link to the repository.

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
src/     # Vue 3 SPA client (shadcn-vue, Tailwind, Pinia, TanStack Query)
server/  # Cloudflare Worker: Hono API (routes, middleware, GitHub OAuth),
         #   feed pipeline, Drizzle db + migrations, refresh Workflow
shared/  # Zod schemas, shared types, constants, utilities + compatibility
public/  # SPA static assets (favicon, manifest)
test/    # bun test suite (db, feeds, api)
```

A single flat project: one `package.json`, one Vite app (Cloudflare Vite
plugin), one tsconfig pair (`tsconfig.json` server / `tsconfig.app.json`
client), one wrangler config.

## Quick start

```sh
bun install
bun run dev          # SPA + Worker API on http://localhost:8787 (one server)
bun run typecheck
bun run lint
bun run test
```

You must configure local secrets first — copy `.dev.vars.example` to
`.dev.vars` and fill in your GitHub OAuth credentials and
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
