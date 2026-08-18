# A Cloudflare Based RSS Reader

A **personal, self-hosted RSS reader** that runs entirely on Cloudflare's serverless platform. This project aims to provide an alternative to [Folo](https://app.folo.is/) for users who don't want to be bothered by its paid plans.

![showcase](docs/showcase.png)

## Features

- **Free and open source** — No ads, tracking, paywalls, or vendor lock-in. Available to users on Cloudflare's free tier.
- **Privacy-focused** — All data is stored in your own Cloudflare accounts, with authentication through your own GitHub account.
- **Modern UX** — Responsive three-column layout, keyboard navigation, mobile-friendly interface, and multi-language support.
- **AI summaries** — Optional per-article summaries powered by Workers AI. Disabled by default and can be enabled or disabled from Settings.

## Quick start

See **[Quick Start](docs/quick-start.md)** to deploy your own instance on Cloudflare in about 10 minutes (a `bun run setup` script automates most of it).

## Documentation

| Document                             | What's inside                                                   |
| ------------------------------------ | --------------------------------------------------------------- |
| [Quick Start](docs/quick-start.md)   | Deploy your own instance on Cloudflare in ~10 minutes           |
| [Contributing](docs/contribute.md)   | Local development, development workflow, and coding conventions |
| [Architecture](docs/architecture.md) | System design, data model, and processing pipeline              |
| [AGENTS.md](AGENTS.md)               | Guidance for AI coding agents working in this repository        |

## Roadmap

- [ ] Mobile/desktop wrapper for the web app
