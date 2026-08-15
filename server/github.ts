/**
 * GitHub OAuth client (web-server flow).
 */

const GITHUB_AUTHORIZE_ENDPOINT = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const GITHUB_USER_ENDPOINT = "https://api.github.com/user";

export interface GitHubUser {
	id: number;
	login: string;
	name: string | null;
	avatar_url: string | null;
}

export interface AuthorizeUrlParams {
	clientId: string;
	redirectUri: string;
	state: string;
}

/** Build the GitHub authorize URL for the login redirect. */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
	const url = new URL(GITHUB_AUTHORIZE_ENDPOINT);
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("state", params.state);
	url.searchParams.set("scope", "read:user");
	url.searchParams.set("response_type", "code");
	return url.toString();
}

export interface ExchangeCodeParams {
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
}

/** Exchange the authorization code for an access token. */
export async function exchangeCode(params: ExchangeCodeParams): Promise<string> {
	const res = await fetch(GITHUB_TOKEN_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: params.clientId,
			client_secret: params.clientSecret,
			code: params.code,
			redirect_uri: params.redirectUri,
		}),
	});
	if (!res.ok) {
		throw new Error(`GitHub token exchange failed with status ${res.status}`);
	}
	const data = (await res.json()) as { access_token?: string; error?: string };
	if (!data.access_token) {
		throw new Error(`GitHub token exchange error: ${data.error ?? "unknown"}`);
	}
	return data.access_token;
}

/** Fetch the authenticated GitHub user profile. */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
	const res = await fetch(GITHUB_USER_ENDPOINT, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
			"User-Agent": "cloudflare-rss-reader",
		},
	});
	if (!res.ok) {
		throw new Error(`GitHub user fetch failed with status ${res.status}`);
	}
	return (await res.json()) as GitHubUser;
}
