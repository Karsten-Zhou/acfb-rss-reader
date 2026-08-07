# Cloudflare-native Personal RSS Reader

Initial milestone foundation for a self-hosted RSS reader on Cloudflare.

## Implemented in this milestone

- Monorepo layout with `apps/web`, `apps/worker`, `packages/database`, and `packages/compatibility`
- Cloudflare Worker API baseline using Hono + Zod
  - `GET /api/health`
  - `GET /api/compatibility?url=<url>`
  - `GET /api/auth/github/start`
  - `GET /api/auth/github/callback`
  - `GET /api/auth/session`
  - `POST /api/auth/logout`
- Compatibility module system with first Steam CSS module
- Drizzle schema package with core tables (`feeds`, `entries`, `sessions`, etc.)
- Vue 3 + Vite web baseline with Vue Router, Pinia, and TanStack Query
- Dark-first three-column responsive shell and mobile bottom navigation baseline

## Auth configuration (single-user GitHub OAuth)

Set these Worker environment variables:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `AUTH_ALLOWED_GITHUB_USER_ID` (your GitHub numeric user ID)
- `AUTH_SESSION_SECRET` (long random secret, minimum 16 chars)
- `AUTH_BASE_URL` (optional explicit app base URL for OAuth callback)

## Install and run

```bash
npm install
npm run dev:web
npm run dev:worker
```

## Test

```bash
npm run test:worker
```
