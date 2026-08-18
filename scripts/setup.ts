#!/usr/bin/env bun
/**
 * One-shot setup for the Cloudflare RSS Reader.
 *
 * Creates the Cloudflare resources (D1 + KV), asks you for the few secrets
 * only you can provide, wires them into wrangler.jsonc / Cloudflare secrets,
 * applies migrations, then builds and deploys.
 *
 * Run with:  bun run setup
 */

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string): void {
	const result = spawnSync(cmd, { shell: true, stdio: "inherit" });
	if (result.status !== 0) {
		console.error(`\n✖ Command failed (exit ${result.status}): ${cmd}`);
		process.exit(result.status ?? 1);
	}
}

function capture(cmd: string): string {
	return execSync(cmd, { encoding: "utf8" }).trim();
}

interface WranglerConfig {
	d1_databases?: Array<Record<string, unknown>>;
	kv_namespaces?: Array<Record<string, unknown>>;
}

function currentWrangler(path: string): WranglerConfig {
	// Strip comments so the JSONC file can be parsed as plain JSON.
	return JSON.parse(
		readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
	) as WranglerConfig;
}

function writeJsonc(path: string, json: WranglerConfig): void {
	// `JSON.stringify` output is valid JSONC; the file has no comments today.
	writeFileSync(path, `${JSON.stringify(json, null, "\t")}\n`);
}

const readline = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string): Promise<string> {
	const raw = await readline.question(question);
	const value = raw.trim();
	if (!value) {
		console.error("A value is required. Please re-run.");
		process.exit(1);
	}
	return value;
}

function setSecret(name: string, value: string): void {
	console.log(`\n· ${name}`);
	const result = spawnSync(`bunx wrangler secret put ${name}`, {
		shell: true,
		stdio: "inherit",
		input: `${value}\n`,
	});
	if (result.status !== 0) {
		console.error(`\n✖ Could not set secret ${name}.`);
		process.exit(result.status ?? 1);
	}
}

// ---------------------------------------------------------------------------
// 1. Preflight
// ---------------------------------------------------------------------------

console.log("\n── Cloudflare RSS Reader · setup ────────────────────────────\n");

try {
	capture("bun --version");
} catch {
	console.error("Bun is required. Install it from https://bun.sh and re-run.");
	process.exit(1);
}

console.log("Logging in to Cloudflare (opens a browser tab — please approve)…");
run("bunx wrangler login");

console.log("\nChecking your Cloudflare account…\n");
console.log(capture("bunx wrangler whoami"));

// ---------------------------------------------------------------------------
// 2. Create Cloudflare resources (D1 + KV)
// ---------------------------------------------------------------------------

const dbId = capture("bunx wrangler d1 create rss-reader-db").match(
	/"(?:database_id)":\s*"([^"]+)"/,
)?.[1];
if (!dbId) {
	console.error(
		"Could not read the created D1 database_id. Please follow docs/quick-start.md manually.",
	);
	process.exit(1);
}

const kvId = capture("bunx wrangler kv namespace create KV_STORE").match(
	/"(?:id)":\s*"([^"]+)"/,
)?.[1];
if (!kvId) {
	console.error(
		"Could not read the created KV namespace id. Please follow docs/quick-start.md manually.",
	);
	process.exit(1);
}

// Write the bindings into wrangler.jsonc.
const config = currentWrangler("wrangler.jsonc");

const d1 = config.d1_databases?.[0];
if (d1) d1.database_id = dbId;
const kv = config.kv_namespaces?.[0];
if (kv) kv.id = kvId;

writeJsonc("wrangler.jsonc", config);
console.log(
	`\n✓ Wired D1 (${dbId.slice(0, 8)}…) and KV (${kvId.slice(0, 8)}…) into wrangler.jsonc`,
);

// ---------------------------------------------------------------------------
// 3. Gather what only you can provide
// ---------------------------------------------------------------------------

console.log(`
Now set up your GitHub OAuth App (one browser trip, ~1 minute):
  1. Open  https://github.com/settings/developers
  2. OAuth Apps → New OAuth App
  3. Homepage URL:               you can put anything for now (we'll fix it after deploy)
     Authorization callback URL: https://rss-reader.<your-subdomain>.workers.dev/api/auth/callback
       (if you don't know your subdomain yet, use placeholder:  https://placeholder.workers.dev/api/auth/callback)
  4. Register application, then copy the Client ID and generate + copy a Client Secret.
  `);

const clientId = await ask("> GitHub OAuth App  Client ID:     ");
const clientSecret = await ask("> GitHub OAuth App  Client secret: ");
const githubUsername = await ask("> Your GitHub username: ");

const userId = capture(
	`curl -s https://api.github.com/users/${encodeURIComponent(githubUsername)}`,
).match(/"id":\s*(\d+)/)?.[1];
if (!userId) {
	console.error(
		"Could not look up your GitHub user id — check the username and network, then re-run.",
	);
	process.exit(1);
}
console.log(`✓ Found GitHub user id ${userId}`);

const appOrigin = (
	await readline.question(
		"> Public URL of your app (https://…). Empty to use the workers.dev default: ",
	)
).trim();

// ---------------------------------------------------------------------------
// 4. Set Cloudflare secrets
// ---------------------------------------------------------------------------

setSecret("GITHUB_CLIENT_ID", clientId);
setSecret("GITHUB_CLIENT_SECRET", clientSecret);
setSecret("ALLOWED_GITHUB_USER_ID", userId);

if (appOrigin) {
	setSecret("APP_ORIGIN", appOrigin);
} else {
	console.log(
		"\nWe'll use the auto-created workers.dev domain. Set APP_ORIGIN after the first deploy, at the end of this script.",
	);
}

// ---------------------------------------------------------------------------
// 5. Apply migrations
// ---------------------------------------------------------------------------

console.log("\n\nApplying database migrations…");
run("bunx wrangler d1 migrations apply rss-reader-db --remote");

// ---------------------------------------------------------------------------
// 6. Build + deploy
// ---------------------------------------------------------------------------

console.log("\n\nBuilding and deploying…");
run("bun run deploy");

// ---------------------------------------------------------------------------
// 7. Finalize
// ---------------------------------------------------------------------------

let finalOrigin = appOrigin;
if (!finalOrigin) {
	console.log("\nReading your app's public URL…");
	finalOrigin =
		capture("bunx wrangler deployments list").match(/https:\/\/[a-z0-9-]+\.workers\.dev/)?.[0] ??
		"";
	if (!finalOrigin) {
		console.error(
			"Could not auto-detect the deployed URL. Find it in the Cloudflare dashboard and set APP_ORIGIN per docs/quick-start.md.",
		);
		process.exit(1);
	}
	setSecret("APP_ORIGIN", finalOrigin);
}

console.log(`\n✓ Your app is live at ${finalOrigin}`);

console.log(`
Last step — update your GitHub OAuth App (one browser trip):
  1. Open  https://github.com/settings/developers  → your OAuth App
  2. Homepage URL:         ${finalOrigin}
     Authorization callback URL:  ${finalOrigin}/api/auth/callback
  3. Update application.

Then sign in at ${finalOrigin} and you're done 🎉`);
