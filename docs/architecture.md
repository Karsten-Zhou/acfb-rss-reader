# Architecture

> This document captures the high-level architecture and key design decisions.
> It is a living document — update it as the system evolves.

## Overview

A personal, self-hosted RSS reader running entirely on Cloudflare's serverless
platform. One user. Cloudflare-native infrastructure. Vue 3 frontend, Hono API,
D1 database, Workflows for background processing.

## High-level diagram

```mermaid
flowchart LR
  subgraph Browser
    Web[Vue 3 SPA<br/>shadcn-vue / Tailwind]
  end

  subgraph Cloudflare
    Worker[Cloudflare Worker<br/>Workers Assets + Hono API]
    D1[(D1 database)]
    KV[(KV cache)]
    WF[Workflows<br/>RefreshWorkflow]
    Cron[Cron Trigger<br/>every 30 min]
  end

  Web -- "/api/* (same origin)" --> Worker
  Worker -- reads/writes --> D1
  Worker -- caches --> KV
  Worker -- triggers --> WF
  Cron -- selects due feeds --> WF
  WF -- fetches feeds + parses --> D1
```

## Deployment model

One Worker serves both the API (`/api/*`) and the built Vue SPA (Workers
Assets with `single_page_application` not-found handling). This keeps a single
deploy target, keeps the session cookie same-origin, and avoids CORS.

Local development runs two Vite dev servers:

- `apps/worker` — Worker runtime via `@cloudflare/vite-plugin` on port 8787.
- `apps/web` — Vue SPA on port 5173, proxying `/api` to the worker.

## Packages

| Package            | Responsibility                                                       |
| ------------------ | -------------------------------------------------------------------- |
| `packages/shared`  | Zod schemas, domain types, constants, pure utilities                 |
| `packages/database`| Drizzle schema, client factory, SQL migrations                        |
| `packages/feeds`   | Feed fetch (ETag/backoff/retry), parse, normalize, dedupe, pipeline  |
| `packages/compatibility` | Site-specific CSS + detection (Steam first)                    |
| `packages/api`     | Hono app: routes, middleware, GitHub OAuth, session handling         |
| `packages/ui`      | Shared Vue components (composition over inheritance)                 |
| `packages/config`  | Shared tsconfig bases                                                |

## Feed processing pipeline

```
Download -> Normalize -> Deduplicate -> Extract metadata -> Generate preview
-> Store -> Index -> Cache
```

Each step is a pure, testable module in `packages/feeds`.

## Data model

- `feeds` — feed URL, metadata, ETag/Last-Modified, health, folder ref
- `feed_folders` — subscription folders
- `entries` — article metadata (title, url, guid, author, published_at, ...)
- `entry_contents` — full HTML content, separated for light list queries
- `tags` / `entry_tags` — user tags
- `read_status` — read/unread + archived state
- `starred` — starred (saved / read-later)
- `refresh_jobs` — background refresh job bookkeeping
- `fetch_logs` — per-feed fetch diagnostics
- `users` / `sessions` — the single allowed GitHub user + auth sessions
- `settings` — key/value app settings
- `entries_fts` — FTS5 full-text search index

## Authentication

GitHub OAuth, single-user. Flow:

1. `GET /api/auth/login` -> redirect to GitHub authorize with state (KV).
2. `GET /api/auth/callback` -> exchange code, fetch user, verify
   `github_id === ALLOWED_GITHUB_USER_ID`, upsert user, create session.
3. Session token (random 256-bit) stored SHA-256-hashed in D1, delivered as an
   HttpOnly, Secure, SameSite=Lax cookie.
4. `GET /api/auth/me` returns the current user; `POST /api/auth/logout` deletes
   the session.

## Performance strategy

- Lazy-loaded routes & code-splitting (Vue Router dynamic imports).
- Virtualized entry lists.
- Optimistic updates in TanStack Query mutations.
- Cache headers on API responses; KV for favicons and fetched bodies.
- Image lazy loading; memoization with VueUse/Vue computed.

## See also

- `docs/deployment.md` — deploy steps
- `docs/environment.md` — env vars and secrets
