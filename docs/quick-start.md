# Quick Start

Deploy your personal RSS reader in about 10 minutes. One command does the work;
you only do the parts that need _your_ accounts.

## 1 Accounts

- [Cloudflare](https://dash.cloudflare.com/sign-up) — sign up (or log in)
- [GitHub](https://github.com/join) — sign up (you log in to the reader with this)

## 2 Install Git and Bun

Install [Git](https://git-scm.com/downloads) and [Bun](https://bun.sh). A
terminal is enough — you'll run a few commands.

## 3 Clone and install

```sh
git clone https://github.com/XiaoSong-CPE/cloudflare-based-rss-reader.git
cd cloudflare-based-rss-reader
bun install
```

## 4 Create a GitHub OAuth App

1. Open <https://github.com/settings/developers> → **OAuth Apps → New OAuth App**.
2. Application name: `RSS Reader`.
3. Homepage URL and callback URL: put any placeholder for now, e.g.
   `https://placeholder.workers.dev` and
   `https://placeholder.workers.dev/api/auth/callback`.
4. Register the app. Copy the **Client ID**, and generate + copy a **Client secret**.

> You'll update the URLs in step 6.

## 5 Run the setup

```sh
bun run setup
```

It asks for your **OAuth Client ID**, **Client secret**, and **GitHub
username**, then automates the rest (Cloudflare login, database, secrets,
deploy). When it finishes it prints your app's URL.

## 6 Update the OAuth App URLs

Back in [your OAuth App](https://github.com/settings/developers), set:

- **Homepage URL** → the URL from step 5
- **Authorization callback URL** → `<that URL>/api/auth/callback`

Click **Update application**.

## 7 Log in

Open your app's URL and **Sign in with GitHub**. Add a feed. Done.

---

Optional extras (after setup): **AI summaries** — Settings → toggle **AI
Summaries** on and pick a model. **Browser notifications** — see
[push-notifications.md](push-notifications.md).

For developers — what the setup script does, environment variables, and how to
run the app locally: see [Contributing](contribute.md).
