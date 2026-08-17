# Contributing

Development guide for working on the Cloudflare RSS Reader.

## Commands

| Command | What it does |
|---|---|
| `bun install` | Install all dependencies |
| `bun run dev` | Dev server — SPA + Worker API on `http://localhost:8787` |
| `bun run build` | Build the Worker (SPA assets + script) |
| `bun run deploy` | Build then deploy |
| `bun run typecheck` | Typecheck server (`tsc`) + client (`vue-tsc`) |
| `bun run lint` | Biome check |
| `bun run lint:fix` | Biome auto-fix |
| `bun run test` | Run the full bun test suite |
| `bun run db:generate` | Drizzle-kit: schema → SQL migration |
| `bun run db:migrate` | Apply migrations to remote D1 |
| `bun run db:studio` | Drizzle Studio |

## Project layout

```
src/           Vue 3 SPA (shadcn-vue, Tailwind v4, Pinia, TanStack Query)
server/        Cloudflare Worker (Hono API + refresh Workflow)
  db/          Drizzle schema, migrations, D1 client, FTS5 search
  feeds/       Feed fetching, parsing, normalization, pipeline
  routes/      Hono API routes
  middleware/  Hono middleware (context, auth)
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

- **One Worker** serves both the API (`/api/*`) and the built Vue SPA (Workers Assets, `single_page_application` not-found handling). One deploy, same-origin cookies, no CORS.
- **D1** — database. **KV** — caches favicons, OAuth state, feed bodies. **Workflows** — feed refresh with retries. **Cron** — every 30 min.
- **Auth** — GitHub OAuth, single allowed user (`ALLOWED_GITHUB_USER_ID`). Session tokens SHA-256-hashed in D1, HttpOnly cookie.
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

## Known gotchas

- **CRLF (Windows)**: Editor save can CRLF a file → `git status` shows ` M` with empty diff, and `bun run lint` fails (Biome wants LF). Fix: `git restore -- <files>` or `bun run lint:fix`.
- **PowerShell quoting**: `git commit -m "...\"quotes\"..."` breaks. Use a here-string → `Set-Content .git\COMMIT_MSG` → `git commit -F .git\COMMIT_MSG`.
- **Remote D1/KV in local dev**: `remote: true` means local dev hits the real remote resources — writes are slow (seconds) and count toward usage.
- **Dialogs don't close on Escape** (reka-ui) — use the Close button or overlay click.
- **lefthook typecheck can hang** (Windows) with no subprocess spawned. Kill the hung terminal and orphaned lefthook processes, then re-run. lefthook v2.1.10 hangs less.

## See also

- [Quick start](quick-start.md) — setup and deployment
- [Architecture](architecture.md) — detailed system design, data model, and API surface
