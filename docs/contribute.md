# Contributing

Development guide for working on the Cloudflare RSS Reader.

## Commands

| Command               | What it does                                             |
| --------------------- | -------------------------------------------------------- |
| `bun install`         | Install all dependencies                                 |
| `bun run dev`         | Dev server — SPA + Worker API on `http://localhost:8787` |
| `bun run build`       | Build the Worker (SPA assets + script)                   |
| `bun run deploy`      | Build then deploy                                        |
| `bun run typecheck`   | Typecheck server (`tsc`) + client (`vue-tsc`)            |
| `bun run lint`        | Biome check                                              |
| `bun run lint:fix`    | Biome auto-fix                                           |
| `bun run test`        | Run the full bun test suite                              |
| `bun run db:generate` | Drizzle-kit: schema → SQL migration                      |
| `bun run db:migrate`  | Apply migrations to local D1                             |
| `bun run db:studio`   | Drizzle Studio                                           |

## Project layout

```
src/           Vue 3 SPA (shadcn-vue, Tailwind v4, Pinia, TanStack Query)
server/        Cloudflare Worker (Hono API + refresh Workflow)
  db/          Drizzle schema, migrations, D1 client, FTS5 search
  feeds/       Feed fetching, parsing, normalization, pipeline
  routes/      Hono API routes
  middleware/  Hono middleware (request context)
  ai/          Workers AI summaries
  workflows/   RefreshWorkflow (background feed refresh)
shared/        Framework-agnostic code (schemas, utils, compatibility)
test/          bun test suite (db, feeds, api)
public/        Static assets
```

Dependency direction (no cycles):

```
shared → { server/db, server/feeds, src }
server/db + server/feeds → server/routes
server → shared (types, schemas)
src → shared/compatibility
```

Vite aliases: `@` → `src/`, `@shared` → `shared/`, `@server` → `server/`.

## Architecture at a glance

```
Browser (Vue SPA) ─── /api/* (same origin) ───► Cloudflare Worker
                                                     │
                                              D1 ◄───┤──► KV
                                              Workflows ◄── Cron (every 30 min)
```

- **One Worker** serves both the API (`/api/*`) and the built Vue SPA (Workers Assets, `single_page_application` not-found handling). One deploy, same-origin, no CORS.
- **D1** — database. **KV** — caches favicons and feed bodies. **Workflows** — feed refresh with retries. **Cron** — every 30 min.
- **Feed parsing** — `@extractus/feed-extractor` (RSS/Atom/JSON Feed). Raw HTML stored in `entry_contents`, sanitized with DOMPurify at render in the browser.
- **Search** — SQLite FTS5 virtual table.

## Coding conventions

### TypeScript

- Strict mode, `verbatimModuleSyntax` — use `import type` for types.
- Biome for lint + format (`bun run lint`, `bun run format`).
- **Date/time** — use **dayjs**, never hand-roll date math. Client imports the configured instance from `src/lib/dayjs.ts`.

### Auto-imports (CRITICAL)

This project uses two Vite auto-import plugins:

**unplugin-auto-import** — Vue core, vue-router, `@vueuse/core`, vue-i18n, Pinia APIs are auto-imported. Do **not** write explicit imports for `ref`, `computed`, `useI18n`, `defineStore`, `RouterView`, `createRouter`, `createWebHistory`, `createI18n`, etc.

**unplugin-vue-components** — Every component under `src/components/` (including nested `select/`, `scroll-area/`) is auto-imported. Do **not** write explicit component imports in `<script setup>`. Keep only:

- Type-only imports (`import type { HTMLAttributes } from "vue"`)
- Named `.vue` exports (e.g. `buttonVariants` from `UiButton.vue`)

The generated `auto-imports.d.ts`, `components.d.ts`, and `.biomelintrc-auto-import.json` are committed and regenerated on build.

### Components

- Components live in `src/components/` — flat, **Ui-prefixed**, multi-word.
- shadcn primitives use the `Ui` prefix (`UiButton`, `UiBadge`, `UiInput`, `UiSwitch`, `UiSelect`).
- Multi-file groups (`select/`, `scroll-area/`) stay without barrel files — import directly.
- `buttonVariants` / `badgeVariants` live inside `UiButton.vue` / `UiBadge.vue` as named exports via a plain `<script lang="ts">` block.

### Git

- Conventional commits (`feat:`, `fix:`, `chore:`, ...). Small, reviewable commits.
- **lefthook** for git hooks: pre-commit runs lint-staged + typecheck; commit-msg runs commitlint.
- Commitlint enforces `body-max-line-length: 100` — wrap body lines.
- Keep commits runnable and deployable at every milestone.

## Local development

To run the app on your own machine (for testing changes, not for end users):

```sh
bun run dev
```

This starts a development server at `http://localhost:8787`. It connects to
**the same remote Cloudflare database and KV store** you set up for your
deployment, so your local and deployed data stay in sync. Writes in local dev
affect the real remote database and count toward Cloudflare's free-tier usage.

> Requires the Cloudflare login from the quick start (`bunx wrangler login`).

|                 | Deployed                    | Local (`bun run dev`)        |
| --------------- | --------------------------- | ---------------------------- |
| URL             | `https://<you>.workers.dev` | `http://localhost:8787`      |
| Where code runs | Cloudflare edge network     | Your computer                |
| Database        | Remote D1                   | Same remote D1               |
| KV store        | Remote KV                   | Same remote KV               |
| Cost            | Cloudflare free tier        | Same (uses remote resources) |

## Deployment reference

`bun run setup` (a typed script at `scripts/setup.ts`) automates deployment.
For a normal install you only need [quick-start.md](quick-start.md); this is
what it does and how to reproduce it by hand.

### What the setup script does

Re-running it is safe — existing resources are reused.

1. `bunx wrangler login` — log in to Cloudflare; read the account id from
   `wrangler whoami`.
2. Determine the public URL before deploying: the worker name from
   `wrangler.jsonc` and the account's workers.dev subdomain from the
   Cloudflare API (`GET /accounts/:id/workers/subdomain`) →
   `https://rss-reader.<subdomain>.workers.dev`.
3. Create or reuse the resources via the Cloudflare API and write their IDs
   into `wrangler.jsonc`:
   - D1 database `rss-reader-db` → `DB.database_id`
   - KV namespace `rss-reader-kv` → `KV_STORE.id` (a namespace still named
     `KV_STORE` is renamed in place — the id and its data are kept)
4. Applies migrations (`wrangler d1 migrations apply … --remote`), builds and
   deploys (`bun run deploy`).
5. Generates the Web Push VAPID key pair (`web-push generate-vapid-keys`),
   stores `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` as
   secrets and writes them into `.dev.vars` for local dev.
6. Polls `GET /api/health` to verify the deployment.

### Environment variables

| Variable                 | Kind    | Description                                              |
| ------------------------ | ------- | -------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`       | secret  | Web Push VAPID public key (optional)                     |
| `VAPID_PRIVATE_KEY`      | secret  | Web Push VAPID private key (server-only)                 |
| `VAPID_SUBJECT`          | secret  | Web Push contact (`mailto:`/`https://`)                  |
| `DB`                     | binding | D1 database                                              |
| `KV_STORE`               | binding | KV namespace                                             |
| `REFRESH_WORKFLOW`       | binding | Auto-configured by Cloudflare                            |
| `AI`                     | binding | Auto-configured by Cloudflare                            |

Secrets are managed with `wrangler secret put <NAME>` (remote) and
`.dev.vars` (local dev). Never commit real secrets.

## See also

- [Quick start](quick-start.md) — setup and deployment
- [Architecture](architecture.md) — detailed system design, data model, and API surface
