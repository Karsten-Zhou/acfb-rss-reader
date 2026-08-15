/**
 * Hashing and token helpers. Uses the Web Crypto API so it works on
 * Cloudflare Workers and Bun alike.
 */

/** SHA-256 of `input`, hex-encoded. */
export async function sha256Hex(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A cryptographically random hex string, `bytes` bytes long. */
export function randomHex(bytes = 32): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time string comparison, useful for comparing secrets where a fast
 * mismatch could leak timing information.
 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);
	let diff = 0;
	for (let i = 0; i < aBytes.length; i++) {
		diff |= aBytes[i]! ^ bBytes[i]!;
	}
	return diff === 0;
}
