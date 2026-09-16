#!/usr/bin/env bun
/**
 * One-shot setup for the Cloudflare RSS Reader.
 *
 * Safe to re-run — existing resources are reused:
 *   1. Log in to Cloudflare and identify your account.
 *   2. Determine your app's public URL:
 *      https://<worker name>.<account workers.dev subdomain>.workers.dev
 *   3. Create or reuse the D1 + KV resources and wire their IDs into
 *      wrangler.jsonc.
 *   4. Apply database migrations, build and deploy.
 *   5. Store secrets and generate the Web Push VAPID key pair + VAPID_SUBJECT
 *      (also written to .dev.vars, so local dev uses the same keys).
 *   6. Verify the deployment with a /api/health check.
 *
 * Run with:  bun run setup
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

// ---------------------------------------------------------------------------
// Names & constants
// ---------------------------------------------------------------------------

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const WRANGLER_PATH = "wrangler.jsonc";
const DEV_VARS_PATH = ".dev.vars";

// Resource names on the Cloudflare account.
const D1_NAME = "rss-reader-db";
const KV_NAME = "rss-reader-kv";

// Secret names.
const SECRET_VAPID_PUBLIC = "VAPID_PUBLIC_KEY";
const SECRET_VAPID_PRIVATE = "VAPID_PRIVATE_KEY";
const SECRET_VAPID_SUBJECT = "VAPID_SUBJECT";

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

function run(cmd: string): void {
	const result = spawnSync(cmd, { shell: true, stdio: "inherit" });
	if (result.status !== 0) {
		console.error(`\n✖ Command failed (exit ${result.status}): ${cmd}`);
		process.exit(result.status ?? 1);
	}
}

function runCapture(cmd: string): string {
	const result = spawnSync(cmd, { shell: true, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`Command failed (exit ${result.status}): ${cmd}\n${result.stderr ?? ""}`);
	}
	return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

// ANSI color codes can wrap command output; strip them so JSON parsing below
// stays robust.
const ESC = String.fromCharCode(27);

/** Remove ANSI escape sequences (like color codes) from a string. */
function stripAnsi(text: string): string {
	return text
		.split(ESC)
		.map((part) => part.replace(/^\[[0-9;]*m/, ""))
		.join("");
}

/** Pull the first balanced JSON object/array out of mixed command output. */
function extractJson(raw: string): string {
	const text = stripAnsi(raw);
	const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
	if (!starts.length) throw new Error("No JSON in command output");
	const start = Math.min(...starts);
	const open = text[start];
	const close = open === "{" ? "}" : "]";
	let depth = 0;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (ch === open) depth++;
		else if (ch === close) {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	throw new Error("Unbalanced JSON in command output");
}

function runJson<T>(cmd: string): T {
	return JSON.parse(extractJson(runCapture(cmd))) as T;
}

function fail(message: string): never {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

const shortId = (id: string): string => `${id.slice(0, 8)}…`;

const readline = createInterface({ input: process.stdin, output: process.stdout });

/** Ask a required question. */
async function ask(question: string): Promise<string> {
	const value = (await readline.question(question)).trim();
	if (!value) fail("A value is required. Please re-run.");
	return value;
}

/** Ask a question with a default (used when the answer is empty). */
async function askWithDefault(question: string, fallback: string): Promise<string> {
	const value = (await readline.question(question)).trim();
	return value || fallback;
}

function setSecret(name: string, value: string): void {
	console.log(`· Setting secret ${name}`);
	const result = spawnSync(`bunx wrangler secret put ${name}`, {
		shell: true,
		stdio: ["pipe", "inherit", "inherit"],
		input: `${value}\n`,
	});
	if (result.status !== 0) fail(`Could not set secret ${name}.`);
}

// ---------------------------------------------------------------------------
// Wrangler config (wrangler.jsonc) helpers
// ---------------------------------------------------------------------------

interface WranglerConfig {
	name?: string;
	d1_databases?: Array<Record<string, unknown>>;
	kv_namespaces?: Array<Record<string, unknown>>;
}

function readWrangler(path: string): WranglerConfig {
	// Strip comments so the JSONC file parses as plain JSON.
	return JSON.parse(
		readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
	) as WranglerConfig;
}

function writeWrangler(path: string, config: WranglerConfig): void {
	// JSON.stringify output is valid JSONC; the file has no comments.
	writeFileSync(path, `${JSON.stringify(config, null, "\t")}\n`);
}

// ---------------------------------------------------------------------------
// Cloudflare account & API
// ---------------------------------------------------------------------------

interface AccountInfo {
	id: string;
	name: string;
}

function parseAccounts(raw: string): AccountInfo[] {
	const parsed = JSON.parse(extractJson(raw)) as {
		accounts?: Array<{ id?: string; name?: string }>;
	};
	const accounts = (parsed.accounts ?? [])
		.filter((a): a is { id: string; name?: string } => typeof a.id === "string")
		.map((a) => ({ id: a.id, name: a.name ?? a.id }));
	if (!accounts.length) {
		fail("`wrangler whoami` returned no accounts. Is wrangler logged in?");
	}
	return accounts;
}

async function pickAccount(accounts: AccountInfo[]): Promise<AccountInfo> {
	if (accounts.length === 1) {
		const only = accounts[0];
		if (!only) fail("No Cloudflare account found.");
		console.log(`✓ Cloudflare account: ${only.name} (${only.id})`);
		return only;
	}
	console.log("\nMultiple Cloudflare accounts found:");
	for (let i = 0; i < accounts.length; i++) {
		const account = accounts[i];
		if (account) console.log(`  [${i + 1}] ${account.name} (${account.id})`);
	}
	for (;;) {
		const answer = (
			await readline.question(`> Which account do you want to deploy to? [1-${accounts.length}] `)
		).trim();
		const index = Number.parseInt(answer, 10) - 1;
		const picked = accounts[index];
		if (picked) return picked;
		console.log("Please enter a number from the list.");
	}
}

/** Read the OAuth token stored by `wrangler login`. */
function getCloudflareToken(): string {
	const token = runCapture("bunx wrangler auth token")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && /^[A-Za-z0-9._-]{20,}$/.test(line))
		.pop();
	if (!token) {
		fail("Could not read the Cloudflare OAuth token. Run `bunx wrangler login` and re-run.");
	}
	return token;
}

interface CloudflareResponse<T> {
	result: T;
	result_info?: { page: number; total_pages: number };
	success: boolean;
	errors?: Array<{ message?: string }>;
}

async function cloudflareRequest<T>(
	token: string,
	method: "GET" | "POST" | "PUT",
	path: string,
	payload?: unknown,
): Promise<CloudflareResponse<T>> {
	const response = await fetch(`${CLOUDFLARE_API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			...(payload === undefined ? {} : { "Content-Type": "application/json" }),
		},
		body: payload === undefined ? undefined : JSON.stringify(payload),
	}).catch((error: unknown) => fail(`Cloudflare API request failed: ${String(error)}`));
	const body = (await response.json().catch(() => null)) as CloudflareResponse<T> | null;
	if (!body?.success) {
		const message = body?.errors
			?.map((e) => e.message)
			.filter(Boolean)
			.join("; ");
		fail(`Cloudflare API error (${method} ${path}): ${message || `HTTP ${response.status}`}`);
	}
	return body;
}

/** GET a full (paginated) list from the Cloudflare API. */
async function cloudflareList<T>(token: string, path: string): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1; ; page++) {
		const separator = path.includes("?") ? "&" : "?";
		const response = await cloudflareRequest<T[] | null>(
			token,
			"GET",
			`${path}${separator}per_page=100&page=${page}`,
		);
		if (response.result) items.push(...response.result);
		if (!response.result_info || page >= response.result_info.total_pages) break;
	}
	return items;
}

/** Fetch the account's workers.dev subdomain. */
async function detectWorkersDevSubdomain(token: string, accountId: string): Promise<string | null> {
	try {
		const response = await cloudflareRequest<{ subdomain?: string }>(
			token,
			"GET",
			`/accounts/${accountId}/workers/subdomain`,
		);
		return response.result.subdomain || null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Resource provisioning (idempotent)
// ---------------------------------------------------------------------------

interface D1Info {
	uuid: string;
	name: string;
}
interface KvInfo {
	id: string;
	title: string;
}

/** Create-or-reuse the D1 database. */
async function provisionD1(
	token: string,
	accountId: string,
	config: WranglerConfig,
): Promise<D1Info> {
	const binding = config.d1_databases?.[0];
	if (!binding) fail(`No d1_databases binding found in ${WRANGLER_PATH}.`);

	const existing = await cloudflareList<D1Info>(token, `/accounts/${accountId}/d1/database`);

	const byName = existing.find((db) => db.name === D1_NAME);
	if (byName) {
		console.log(`✓ Reusing D1 database ${byName.name} (${shortId(byName.uuid)})`);
		return byName;
	}

	const configuredId = typeof binding.database_id === "string" ? binding.database_id : "";
	const configured = existing.find((db) => db.uuid === configuredId);
	if (configured) {
		console.log(`✓ Reusing D1 database ${configured.name} (${shortId(configured.uuid)})`);
		return configured;
	}

	console.log(`· Creating D1 database ${D1_NAME}…`);
	const created = await cloudflareRequest<D1Info>(
		token,
		"POST",
		`/accounts/${accountId}/d1/database`,
		{ name: D1_NAME },
	);
	return created.result;
}

/** Rename a KV namespace in place (the id, and with it all data, is kept). */
async function renameKvNamespace(token: string, accountId: string, ns: KvInfo): Promise<KvInfo> {
	console.log(`· Renaming KV namespace "${ns.title}" → "${KV_NAME}"…`);
	const renamed = await cloudflareRequest<KvInfo>(
		token,
		"PUT",
		`/accounts/${accountId}/storage/kv/namespaces/${ns.id}`,
		{ title: KV_NAME },
	);
	return renamed.result;
}

/** Create-or-reuse the KV namespace. */
async function provisionKv(
	token: string,
	accountId: string,
	config: WranglerConfig,
): Promise<KvInfo> {
	const binding = config.kv_namespaces?.[0];
	if (!binding) fail(`No kv_namespaces binding found in ${WRANGLER_PATH}.`);

	const path = `/accounts/${accountId}/storage/kv/namespaces`;
	const existing = await cloudflareList<KvInfo>(token, path);

	const byName = existing.find((ns) => ns.title === KV_NAME);
	if (byName) {
		console.log(`✓ Reusing KV namespace ${byName.title} (${shortId(byName.id)})`);
		return byName;
	}

	const configuredId = typeof binding.id === "string" ? binding.id : "";
	const configured = existing.find((ns) => ns.id === configuredId);
	if (configured) return renameKvNamespace(token, accountId, configured);

	console.log(`· Creating KV namespace ${KV_NAME}…`);
	const created = await cloudflareRequest<KvInfo>(token, "POST", path, { title: KV_NAME });
	return created.result;
}

// ---------------------------------------------------------------------------
// Push notification (VAPID) setup
// ---------------------------------------------------------------------------

interface VapidKeys {
	publicKey: string;
	privateKey: string;
}

function generateVapidKeys(): VapidKeys {
	const keys = runJson<VapidKeys>("bunx web-push generate-vapid-keys --json");
	if (!keys.publicKey || !keys.privateKey) fail("Could not generate VAPID keys.");
	return keys;
}

/**
 * Write values into `.dev.vars` so local dev uses the same configuration as
 * production. Existing keys are updated in place, new ones are appended,
 * everything else in the file is preserved.
 */
function updateDevVars(values: Record<string, string>): void {
	const base = existsSync(DEV_VARS_PATH) ? readFileSync(DEV_VARS_PATH, "utf8") : "";
	const lines = base.length ? base.replace(/\r?\n$/, "").split(/\r?\n/) : [];
	if (!lines.length) {
		lines.push("# Local development secrets (git-ignored). Created by bun run setup.");
	}
	for (const [key, value] of Object.entries(values)) {
		const index = lines.findIndex((line) => line.startsWith(`${key}=`));
		if (index >= 0) lines[index] = `${key}=${value}`;
		else lines.push(`${key}=${value}`);
	}
	writeFileSync(DEV_VARS_PATH, `${lines.join("\n")}\n`);
}

// ---------------------------------------------------------------------------
// Post-deploy health check
// ---------------------------------------------------------------------------

async function waitForHealth(origin: string): Promise<void> {
	const url = `${origin}/api/health`;
	for (let attempt = 1; attempt <= 8; attempt++) {
		try {
			const response = await fetch(url, { headers: { Accept: "application/json" } });
			const body = (await response.json()) as { ok?: boolean; database?: string };
			if (response.ok && body.ok && body.database === "ok") {
				console.log("✓ Health check passed (/api/health)");
				return;
			}
		} catch {
			// Not up yet — retry.
		}
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
	console.warn(
		`⚠ Could not verify ${url} yet — the deploy may still be rolling out. Check it in a browser.`,
	);
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

function usage(): void {
	console.log(
		[
			"",
			"Cloudflare RSS Reader · one-shot setup",
			"",
			"Usage: bun run setup",
			"",
			"Automates: Cloudflare login, workers.dev URL detection, D1 + KV setup,",
			"Web Push (VAPID) key generation, migrations and the first deploy.",
			"Re-running it is safe — existing resources are reused.",
			"",
		].join("\n"),
	);
}

async function main(): Promise<void> {
	if (process.argv.includes("--help") || process.argv.includes("-h")) {
		usage();
		readline.close();
		return;
	}

	console.log("\n── Cloudflare RSS Reader · setup ────────────────────────────\n");

	// -- 1. Cloudflare account -------------------------------------------------
	console.log("Logging in to Cloudflare (opens a browser tab — please approve)…");
	run("bunx wrangler login");

	console.log("\nChecking your Cloudflare account…");
	const account = await pickAccount(parseAccounts(runCapture("bunx wrangler whoami --json")));
	const token = getCloudflareToken();

	// -- 2. Determine the public URL -------------------------------------------
	// workers.dev URL = https://<worker name>.<account subdomain>.workers.dev
	const config = readWrangler(WRANGLER_PATH);
	const workerName = config.name ?? "rss-reader";

	let subdomain = await detectWorkersDevSubdomain(token, account.id);
	if (!subdomain) {
		console.warn("\n⚠ Could not detect your workers.dev subdomain via the Cloudflare API.");
		console.warn('  Find it in the dashboard: Workers & Pages → "Your subdomain".');
		subdomain = await ask("> Your workers.dev subdomain (e.g. my-subdomain): ");
	}

	const defaultOrigin = `https://${workerName}.${subdomain}.workers.dev`;
	console.log(`\n✓ Your app's public URL: ${defaultOrigin}`);

	// If something already answers at that URL (a previous deployment or
	// another Worker with the same name), make sure it is wanted.
	const probe = await fetch(`${defaultOrigin}/api/health`).catch(() => null);
	if (probe && probe.status !== 404) {
		console.log("\n⚠ That URL already responds.");
		const answer = await askWithDefault("> Use it anyway? [Y/n] ", "y");
		if (!/^y(es)?$/i.test(answer)) {
			fail(
				"Aborted. Rename the worker (wrangler.jsonc → name) or free the subdomain, then re-run.",
			);
		}
	}

	// -- 3. Provision D1 + KV and wire them into wrangler.jsonc --------------
	const d1 = await provisionD1(token, account.id, config);
	const kv = await provisionKv(token, account.id, config);

	const d1Binding = config.d1_databases?.[0];
	if (d1Binding) {
		d1Binding.database_id = d1.uuid;
		d1Binding.database_name = d1.name;
	}
	const kvBinding = config.kv_namespaces?.[0];
	if (kvBinding) kvBinding.id = kv.id;
	writeWrangler(WRANGLER_PATH, config);
	console.log(`✓ Wired D1 (${shortId(d1.uuid)}) and KV (${shortId(kv.id)}) into ${WRANGLER_PATH}`);

	// -- 4. Migrations + deploy -------------------------------------------------
	let existingSecrets: Array<{ name: string }> = [];
	try {
		existingSecrets = runJson<Array<{ name: string }>>("bunx wrangler secret list");
	} catch {
		// The Worker has not been deployed yet — no secrets can exist.
	}
	const hasSecret = (name: string) => existingSecrets.some((s) => s.name === name);

	// No more interactive questions below — release the readline handle so the
	// secret prompts (which pipe values via stdin) don't clash with it.
	readline.close();

	console.log("\nApplying database migrations…");
	run(`bunx wrangler d1 migrations apply ${d1.name} --remote`);

	console.log("\nBuilding and deploying…");
	run("bun run deploy");

	// -- 5. Web Push (VAPID) ------------------------------------------------------
	if (hasSecret(SECRET_VAPID_PUBLIC) && hasSecret(SECRET_VAPID_PRIVATE)) {
		console.log(
			"\n✓ VAPID keys are already configured — leaving them untouched.\n" +
				"  (Secrets cannot be read back; if local push needs them, copy the keys\n" +
				"   into .dev.vars yourself — see docs/push-notifications.md.)",
		);
	} else {
		console.log("\nGenerating Web Push (VAPID) keys…");
		const keys = generateVapidKeys();
		// Single-user app: a synthetic contact address derived from the
		// Cloudflare account id. Push services only use it to reach out if
		// something is wrong with delivery.
		const subject = `mailto:plz_contact_cloudflare_user_${account.id}@no-reply.com`;
		setSecret(SECRET_VAPID_PUBLIC, keys.publicKey);
		setSecret(SECRET_VAPID_PRIVATE, keys.privateKey);
		setSecret(SECRET_VAPID_SUBJECT, subject);

		const devVarsExisted = existsSync(DEV_VARS_PATH);
		updateDevVars({
			VAPID_PUBLIC_KEY: keys.publicKey,
			VAPID_PRIVATE_KEY: keys.privateKey,
			VAPID_SUBJECT: subject,
		});
		console.log(
			devVarsExisted
				? "✓ Also wrote the VAPID keys into .dev.vars (local dev uses the same keys)."
				: "✓ Created .dev.vars with the VAPID keys.",
		);
	}

	// -- 6. Verify ------------------------------------------------------------------
	await waitForHealth(defaultOrigin);

	console.log(`
✓ Your app is live at ${defaultOrigin}

Optional extras:
  · Browser notifications: Settings → Browser notifications —
    see docs/push-notifications.md
  · AI summaries: Settings → AI Summaries

Local development: bun run dev  → http://localhost:8787`);
}

await main();
