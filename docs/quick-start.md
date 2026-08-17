# Quick Start

Ask an AI for help if you don't know what to do.

## What you'll end up with

A personal RSS reader hosted at `https://<your-name>.workers.dev`. One user (you), your own Cloudflare data, no third-party servers.

## 1 · Create accounts

You need two free accounts:

1. **Cloudflare** — [sign up](https://dash.cloudflare.com/sign-up) (or log in if you already have one).
2. **GitHub** — [sign up](https://github.com/join) (you'll use this to log in to the reader).

## 2 · Install prerequisites

Open a terminal on your computer and install these tools:

| Tool | What it is | Install |
|---|---|---|
| [Git](https://git-scm.com/downloads) | Version control | Download and run the installer |
| [Bun](https://bun.sh) | JavaScript runtime & package manager | Visit [bun.sh](https://bun.sh) and follow the install command for your OS |

> **How to open a terminal:** Windows — press <kbd>Win</kbd>, type "PowerShell", press Enter. Mac — open "Terminal" from Applications → Utilities. Linux — search for "Terminal" in your app launcher.

## 3 · Clone the project

```sh
git clone https://github.com/XiaoSong-CPE/cloudflare-based-rss-reader.git
cd cloudflare-based-rss-reader
bun install
```

## 4 · Create Cloudflare resources

Log in to Cloudflare from the terminal:

```sh
bunx wrangler login
```

This opens a browser page — approve it.

Then create the two cloud resources the app needs:

```sh
# Database (D1)
bunx wrangler d1 create rss-reader-db
```

Copy the `database_id` from the output — you'll need it in the next step.

```sh
# Key-Value store (KV)
bunx wrangler kv namespace create KV_STORE
```

Copy the `id` from the output as well.

Now open `wrangler.jsonc` in a text editor and paste the IDs into the bindings:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_id": "paste-your-database_id-here"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV_STORE",
      "id": "paste-your-id-here"
    }
  ]
}
```

## 5 · Create a GitHub OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers).
2. Click **OAuth Apps** → **New OAuth App**.
3. Fill in:
   - **Application name:** `RSS Reader` (anything you like).
   - **Homepage URL:** `https://<your-cf-username>.workers.dev` — but you don't know this yet, so use a placeholder like `https://placeholder.workers.dev` for now.
   - **Authorization callback URL:** `https://<your-cf-username>.workers.dev/api/auth/callback` — same placeholder for now.
4. Click **Register application**.
5. Copy the **Client ID**.
6. Click **Generate a new client secret** and copy it immediately (it won't be shown again).

> You'll update the URLs after deploying in step 8.

## 6 · Find your GitHub user ID

Open this URL in a browser, replacing `<your-username>` with your GitHub username:

```
https://api.github.com/users/<your-username>
```

Find the `"id"` field — it's a number like `12345678`. This is **not** your username; it's your unique numeric ID.

## 7 · Set secrets and apply migrations

Tell Cloudflare the secrets the app needs. Paste the values when prompted:

```sh
# Your GitHub OAuth credentials
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET

# Your numeric GitHub user ID (from step 6)
bunx wrangler secret put ALLOWED_GITHUB_USER_ID

# Your app's public URL (https://<your-cf-username>.workers.dev)
bunx wrangler secret put APP_ORIGIN
```

Then set up the database tables:

```sh
bunx wrangler d1 migrations apply rss-reader-db --remote
```

## 8 · Deploy

```sh
bun run deploy
```

After a minute or two, the app is live at `https://<your-cf-username>.workers.dev`.

## 9 · Update the OAuth App URLs and Worker Secrets

Go back to [your OAuth App settings](https://github.com/settings/developers), open the app you created in step 5, and update:

- **Homepage URL** → `https://<your-cf-username>.workers.dev`
- **Authorization callback URL** → `https://<your-cf-username>.workers.dev/api/auth/callback`

Click **Update application**.

```sh
# Update your app's public URL
bunx wrangler secret put APP_ORIGIN
```

## 10 · Log in

Open `https://<your-cf-username>.workers.dev` in your browser. Click **Sign in with GitHub**. You should see the RSS reader dashboard.

---

## AI summaries (optional)

The app can generate per-article AI summaries using Cloudflare Workers AI. This feature is **off by default**.

To enable it:

1. Open the app and go to **Settings**.
2. Toggle **AI Summaries** on and pick a model.

The AI runs on your Cloudflare account (free tier: 10,000 neurons/day). Summaries are cached for 30 days so repeated views are free.

---

## Local development

If you want to run the app on your own computer instead of deploying:

```sh
bun run dev
```

This starts a development server at `http://localhost:8787`. It connects to the same remote Cloudflare database and KV store you set up above, so your local and deployed data stay in sync.

> **Note:** Local development requires the Cloudflare login from step 4. Writes in local dev affect the real remote database and count toward Cloudflare's free-tier usage.

### Updating the OAuth App for local dev

Add `http://localhost:8787/api/auth/callback` to your GitHub OAuth App's callback URLs (GitHub allows up to 10) so local login works too.

### What's the difference?

| | Deployed (step 8) | Local (`bun run dev`) |
|---|---|---|
| URL | `https://<you>.workers.dev` | `http://localhost:8787` |
| Where code runs | Cloudflare edge network | Your computer |
| Database | Remote D1 | Same remote D1 |
| KV store | Remote KV | Same remote KV |
| Cost | Cloudflare free tier | Same (uses remote resources) |

---

## Reference: environment variables

For reference, here are all the variables the app uses:

| Variable | Kind | Description |
|---|---|---|
| `GITHUB_CLIENT_ID` | secret | GitHub OAuth App client ID (step 7) |
| `GITHUB_CLIENT_SECRET` | secret | GitHub OAuth App client secret (step 7) |
| `ALLOWED_GITHUB_USER_ID` | secret | Your numeric GitHub user ID (step 7) |
| `APP_ORIGIN` | secret | Your app's public URL (step 7) |
| `DB` | binding | D1 database (step 4) |
| `KV_STORE` | binding | KV namespace (step 4) |
| `REFRESH_WORKFLOW` | binding | Auto-configured by Cloudflare |
| `AI` | binding | Auto-configured by Cloudflare |

## See also

- [Architecture](architecture.md) — how the system works under the hood
- [Contributing](contribute.md) — development workflow and coding conventions
