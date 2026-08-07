# Cloudflare-native Personal RSS Reader

Initial milestone foundation for a self-hosted RSS reader on Cloudflare.

## Implemented in this milestone

- Monorepo layout with `apps/web`, `apps/worker`, `packages/database`, and `packages/compatibility`
- Cloudflare Worker API baseline using Hono + Zod
  - `GET /api/health`
  - `GET /api/compatibility?url=<url>`
- Compatibility module system with first Steam CSS module
- Drizzle schema package with core tables (`feeds`, `entries`, `sessions`, etc.)
- Vue 3 + Vite web baseline with Vue Router, Pinia, and TanStack Query
- Dark-first three-column responsive shell and mobile bottom navigation baseline

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
