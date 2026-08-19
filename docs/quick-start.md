# Quick Start

Deploy your personal RSS reader in about 10 minutes. One command does the work; you only do the parts that need _your_ accounts.

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

## 4 Run the setup

```sh
bun run setup
```

The script logs you into Cloudflare, works out your app's public URL
(`https://rss-reader.<your-subdomain>.workers.dev`), creates the database and
key-value store, and then asks for:

- the **Client ID** and **Client secret** of a GitHub OAuth App — right before
  that it prints the exact **Homepage URL** and **Authorization callback URL**
  to enter when you create the app at
  <https://github.com/settings/developers> (**OAuth Apps → New OAuth App**),
- your **GitHub username** (so that only you can log in).

It then stores everything as Cloudflare secrets, generates the Web Push
(VAPID) keys for browser notifications, applies the database schema and
deploys. When it finishes, it prints your app's URL.

## 5 Log in

Open your app's URL and **Sign in with GitHub**. Done.

---

Optional extras (after setup): **AI summaries** — Settings → toggle **AI
Summaries** on and pick a model. **Browser notifications** — the keys are
already set up; just flip the switch under Settings → Browser notifications
([details](push-notifications.md)).

For developers — what the setup script does, environment variables, and how to
run the app locally: see [Contributing](contribute.md).
