# AGENTS.md

Guidance for AI coding agents and humans working in this repository.

## What this is

A **personal, single-user RSS reader** that runs entirely on Cloudflare's
serverless platform. Not a SaaS. One user. Cloudflare-native infra (Workers,
D1, KV, Workflows, Cron Triggers, Workers Assets).

## Repository layout (monorepo, Bun workspaces)

```
apps/
  web/        # Vue 3 + Vite SPA (shadcn-vue, Tailwind, Pinia, TanStack Query)
  worker/     # Cloudflare Worker: Hono API + bindings + serves web assets
packages/
  api/            # Hono application (routes, middleware, auth) — framework-agnostic
  compatibility/  # Site compatibility modules (Steam first) — CSS + detection
  config/         # Shared tsconfig bases
  database/       # Drizzle schema, migrations, DB client factory
  feeds/          # Feed fetching, parsing, normalization, pipeline
  shared/         # Zod schemas, shared types, constants, small utils
  ui/             # Shared Vue components (business logic stays out of UI)
```

Dependency direction (no cycles):

```
shared -> { database, feeds, compatibility }
database + feeds + compatibility -> api
api + database -> apps/worker
shared + ui -> apps/web
```

## Runtime & tooling

- **Bun** is the package manager and runtime (`bun install`, `bun run`, `bun test`).
- **Biome** for lint + format (`bun run lint`, `bun run format`).
- **lefthook** for git hooks (pre-commit: lint-staged + typecheck; commit-msg:
  commitlint). Conventional commits enforced.
- TypeScript, strict mode, `verbatimModuleSyntax` — use `import type` for types.

## Commands

```sh
bun install            # install all workspace deps
bun run dev            # dev: web (5173) + worker (8787) concurrently
bun run dev:web        # Vue SPA only
bun run dev:worker     # Worker API only
bun run build          # build web + worker
bun run deploy         # build then deploy the Worker (which serves API + SPA)
bun run typecheck      # typecheck all workspaces
bun run lint           # biome check
bun run test           # run package tests
```

Database (from `packages/database`):

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
7. Business logic lives in `packages/*`, never in UI components. Components are
   thin and composed.

## Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`, ...). Small, reviewable commits.
- Prefer mature, actively-maintained, Cloudflare-compatible libraries over
  custom infrastructure. Do not reinvent feed parsing, sanitization, HTTP
  retry, virtualization, etc.
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
