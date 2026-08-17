# AGENTS.md

Guidance for AI coding agents and humans working in this repository.

## What this is

A **personal, single-user RSS reader** that runs entirely on Cloudflare's
serverless platform. Not a SaaS. One user. Cloudflare-native infra (Workers,
D1, KV, Workflows, Cron Triggers, Workers Assets).

## Repository layout (single flat project)

```
src/     # Vue 3 SPA client (shadcn-vue, Tailwind, Pinia, TanStack Query)
server/  # Cloudflare Worker (Hono API + refresh Workflow)
  db/        # Drizzle schema, migrations, D1 client, FTS5 search, test mocks
  feeds/     # Feed fetching, parsing, normalization, pipeline
  routes/    # Hono API routes
  middleware/# Hono middleware (context, auth)
  test/      # bun tests live at the repo-root `test/` instead
shared/  # Framework-agnostic code used by both client and server
  compatibility/  # Site compatibility modules (Steam first) — CSS + detection
  schemas/        # Zod schemas
  utils/          # Small pure utilities (hash, time, url)
test/    # bun test suite (db, feeds, api)
public/  # SPA static assets
```

Dependency direction (no cycles):

```
shared -> { server/db, server/feeds, src }
server/db + server/feeds -> server/routes
server -> shared (types, schemas)
src -> shared/compatibility
```

## Runtime & tooling

- **Bun** is the package manager and runtime (`bun install`, `bun run`, `bun test`).
- **Biome** for lint + format (`bun run lint`, `bun run format`).
- **lefthook** for git hooks (pre-commit: lint-staged + typecheck; commit-msg:
  commitlint). Conventional commits enforced.
- TypeScript, strict mode, `verbatimModuleSyntax` — use `import type` for types.
- **unplugin-auto-import** (Vite) auto-imports Vue core + vue-router +
  `@vueuse/core` + vue-i18n + pinia APIs — do NOT write explicit imports for
  those (e.g. `ref`, `computed`, `useI18n`, `defineStore`, `RouterView`). The
  generated `auto-imports.d.ts` / `.biomelintrc-auto-import.json` are committed
  and regenerated on build; keep `tsconfig.app.json` and `biome.json` wired to
  them. Type-only imports (`import type { HTMLAttributes } from "vue"`) stay
  explicit.
- **unplugin-vue-components** (Vite) auto-imports every component under
  `src/components` (including nested folders like `select/` and `scroll-area/`)
  — do NOT write explicit component imports in `<script setup>` (`<UiButton>`,
  `<EntryList>`, `<ScrollBar>`, ...). The generated `components.d.ts` is
  committed and wired into `tsconfig.app.json`; `biome.json` excludes it. Keep
  only non-component imports from `.vue` files (e.g. exporting `buttonVariants`
  from `UiButton.vue`) and the root `App.vue` entry point.

## Commands

```sh
bun install            # install all deps
bun run dev            # dev: SPA + Worker API on http://localhost:8787 (one server)
bun run build          # build the worker (SPA assets + Worker script)
bun run deploy         # build then deploy the Worker (which serves API + SPA)
bun run typecheck      # typecheck server (tsc) + client (vue-tsc)
bun run lint           # biome check
bun run test           # run the full bun test suite
```

Database (config: `server/db/drizzle.config.ts`):

```sh
bun run db:generate    # drizzle-kit generate (schema -> SQL migration)
bun run db:migrate     # apply migrations to local D1
bun run db:studio      # drizzle studio
```

## Architecture decisions (read before changing anything)

1. **One Worker serves both API and SPA** via Workers Assets
   (`not_found_handling: single_page_application`). API lives under `/api/*`.
   One deploy, same-origin cookies, no CORS.
2. **D1** is the database. **KV** (`KV_STORE`) caches favicons, OAuth state,
   and feed bodies. **Workflows** (`REFRESH_WORKFLOW`) run feed refreshes with
   retries. **Cron Trigger** (`refresh`, every 30 min) schedules recurring work.
3. **Auth**: GitHub OAuth, single allowed user (`ALLOWED_GITHUB_USER_ID`).
   Session tokens stored hashed (SHA-256) in the `sessions` table; HttpOnly
   cookie. No registration, no roles.
4. **Feed parsing**: `@extractus/feed-extractor` (RSS/Atom/JSON Feed). Raw HTML
   is stored in `entry_contents` and sanitized with **DOMPurify at render time**
   in the browser. Avoid server-side DOM work.
5. **Search**: SQLite **FTS5** virtual table over entries (Cloudflare-native).
6. **Compatibility CSS** is the primary mechanism for site-specific rendering
   fixes; JS fixes are the exception. Each module contributes `detect.ts` +
   `styles.css`.
7. Business logic lives in `server/` (API, feeds, db), never in UI components.
   Components are thin and composed.

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`, ...). Small, reviewable commits.
- Prefer mature, actively-maintained, Cloudflare-compatible libraries over
  custom infrastructure. Do not reinvent feed parsing, sanitization, HTTP
  retry, virtualization, etc.
- **Date/time**: use **dayjs** — never hand-roll date math. The client imports
  the configured instance from `src/lib/dayjs.ts` (relativeTime plugin +
  locale sync); the server imports `dayjs` directly for session/expiry math.
- REST + Hono + Zod validation on every request body/query/param.
- Keep commits runnable and deployable at every milestone.

## Cloudflare-specific references

- Workers: https://developers.cloudflare.com/workers/llms.txt
- D1: https://developers.cloudflare.com/d1/llms.txt
- Workflows: https://developers.cloudflare.com/workflows/llms.txt
- KV: https://developers.cloudflare.com/kv/llms.txt
- Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/index.md
- Docs are available as markdown by appending `.md` to page URLs.

## Environment / secrets

See `docs/environment.md`. Secrets are managed via `wrangler secret put` and
`.dev.vars` for local dev. Never commit real secrets.
