# Environment & Secrets

## Variables

| Variable                  | Kind     | Description                                        |
| ------------------------- | -------- | -------------------------------------------------- |
| `GITHUB_CLIENT_ID`        | secret   | GitHub OAuth App client ID                         |
| `GITHUB_CLIENT_SECRET`    | secret   | GitHub OAuth App client secret                     |
| `ALLOWED_GITHUB_USER_ID`  | secret   | Numeric GitHub user ID of the only allowed user    |
| `APP_ORIGIN`              | secret   | Public origin of the app, e.g. `https://x.workers.dev` or `http://localhost:5173` |
| `DB`                      | binding  | D1 database binding (`rss-reader-db`)              |
| `KV_STORE`                | binding  | KV namespace for cache + OAuth state               |
| `REFRESH_WORKFLOW`        | binding  | Workflows binding for feed refreshes               |

> **Getting your numeric GitHub user ID** (for `ALLOWED_GITHUB_USER_ID`): the
> app matches the numeric ID, not your username. No authentication is needed —
> open `https://api.github.com/users/<your-username>` in a browser and read the
> `"id"` field from the JSON.

## Local development

Copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` and fill in
your values. `.dev.vars` is git-ignored — never commit it.

## Production

Set secrets with `wrangler secret put <NAME>` (interactive) or via the
Cloudflare dashboard. Bindings (`DB`, `KV_STORE`, `REFRESH_WORKFLOW`) are
declared in `apps/worker/wrangler.jsonc`.
