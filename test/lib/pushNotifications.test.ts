import { describe, expect, test } from "bun:test";

import {
	browserSupportsPush,
	describePushState,
	keyToBase64,
	toSubscriptionInput,
	urlBase64ToUint8Array,
} from "../../src/lib/pushNotifications.ts";

/** A mock PushSubscription with a controlled endpoint + keys. */
function makeMockSubscription(endpoint: string, p256dhB64: string, authB64: string) {
	return {
		endpoint,
		expirationTime: null,
		getKey: (name: "p256dh" | "auth") => {
			if (name === "p256dh") {
				const bytes = Uint8Array.from(atob(p256dhB64), (c) => c.charCodeAt(0));
				return bytes.buffer;
			}
			const bytes = Uint8Array.from(atob(authB64), (c) => c.charCodeAt(0));
			return bytes.buffer;
		},
		unsubscribe: () => Promise.resolve(true),
	} as unknown as PushSubscription;
}

describe("urlBase64ToUint8Array", () => {
	test("decodes URL-safe base64 into bytes", () => {
		const b64 = "SGVsbG8td29ybGQ_"; // "Hello-world?" URL-safe
		const decoded = urlBase64ToUint8Array(b64);
		expect(new TextDecoder().decode(decoded)).toBe("Hello-world?");
	});
});

describe("keyToBase64 / toSubscriptionInput", () => {
	test("converts a browser PushSubscription to the persisted payload", () => {
		const p256dh = "AQID"; // bytes 0x01 0x02 0x03
		const auth = "BAUG"; // bytes 0x04 0x05 0x06
		const sub = makeMockSubscription("https://push.example.com/abc", p256dh, auth);
		const input = toSubscriptionInput(sub);
		expect(input.endpoint).toBe("https://push.example.com/abc");
		expect(input.keys.p256dh).toBe(p256dh);
		expect(input.keys.auth).toBe(auth);
		expect(input.expirationTime).toBeNull();
	});

	test("keyToBase64 returns empty for null", () => {
		expect(keyToBase64(null)).toBe("");
	});
});

describe("browserSupportsPush", () => {
	test("returns false when APIs are missing", () => {
		// bun has no browser globals; the function guards on `window`.
		expect(browserSupportsPush()).toBe(false);
	});
});

describe("describePushState", () => {
	test("reports unsupported for 'unsupported' permission", () => {
		expect(describePushState("unsupported", false)).toBe("unsupported");
	});

	test("reports permission-denied", () => {
		expect(describePushState("denied", false)).toBe("permission-denied");
	});

	test("reports subscribed when granted + subscribed", () => {
		expect(describePushState("granted", true)).toBe("subscribed");
	});

	test("reports idle when granted but not subscribed", () => {
		expect(describePushState("granted", false)).toBe("idle");
	});

	test("reports idle for 'default' permission", () => {
		expect(describePushState("default", false)).toBe("idle");
	});
});
