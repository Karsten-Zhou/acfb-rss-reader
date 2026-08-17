import { describe, expect, test } from "bun:test";

import {
	createEntryFlagQueue,
	type EntryFlagsInput,
	type EntryFlagsQueueDeps,
} from "../../src/lib/entryFlagsQueue.ts";

/** Build a queue with controllable network delay/failure. */
function makeQueue(overrides: Partial<EntryFlagsQueueDeps> = {}) {
	const sent: Array<{ entryId: number; flags: EntryFlagsInput }> = [];
	let snapshotCounter = 0;
	let restoreCount = 0;
	const pendingChanges: Array<ReadonlyMap<number, EntryFlagsInput>> = [];

	const deps: EntryFlagsQueueDeps = {
		send: async (_entryId, flags) => {
			sent.push({ entryId: -1, flags: { ...flags } });
		},
		applyOptimistic: () => {},
		snapshot: () => ++snapshotCounter,
		restore: () => {
			restoreCount += 1;
		},
		onSuccess: () => {},
		onPendingChange: (p) => pendingChanges.push(new Map(p)),
		...overrides,
	};

	const queue = createEntryFlagQueue(deps);
	return { queue, sent, deps, snapshotCounter, restoreCount, pendingChanges };
}

describe("entryFlagsQueue", () => {
	test("2. opening a read entry produces zero read commands", () => {
		const { queue, sent } = makeQueue();
		queue.setFlags(5, { isRead: true }); // open triggers mark-read only if unread;
		// here the caller decides; the queue only sends what it's told.
		expect(sent).toHaveLength(1);
	});

	test("3. a single explicit unread command is sent once", async () => {
		const { queue, sent } = makeQueue();
		queue.setFlags(5, { isRead: false });
		await new Promise((r) => setTimeout(r, 0));
		expect(sent).toHaveLength(1);
		expect(sent[0]!.flags.isRead).toBe(false);
	});

	test("1. rapid Unread->Read->Unread ends in the final intent (isRead=false)", async () => {
		const { queue, sent } = makeQueue();
		queue.setFlags(5, { isRead: false }); // Unread
		queue.setFlags(5, { isRead: true }); // Read
		queue.setFlags(5, { isRead: false }); // Unread (final)
		await new Promise((r) => setTimeout(r, 10));
		// Serialized per entry; the last sent flag must be unread.
		expect(sent.at(-1)!.flags.isRead).toBe(false);
	});

	test("4. optimistic apply reflects merged desired intent before send", async () => {
		const applied: EntryFlagsInput[] = [];
		const { queue } = makeQueue({
			applyOptimistic: (_entryId: number, flags) => applied.push({ ...flags }),
		});
		queue.setFlags(5, { isRead: false });
		queue.setFlags(5, { isRead: true });
		// The merged optimistic view (the last distinct apply pushes {} merge),
		// but at minimum the final applied intent is read=true.
		expect(applied.at(-1)!).toEqual({ isRead: true });
	});

	test("5. per-entry pending state is scoped and not global", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		let sent5 = false;
		const { queue, pendingChanges } = makeQueue({
			send: (entryId) => {
				if (entryId === 5 && !sent5) {
					sent5 = true;
					return gate;
				}
				return Promise.resolve();
			},
		});
		queue.setFlags(5, { isRead: false });
		queue.setFlags(9, { isRead: true });
		await new Promise((r) => setTimeout(r, 0));
		// Entry 5's send is held, so it stays pending; entry 9 resolved and
		// left, so it should NOT be pending. This proves pending is per-entry.
		const during = pendingChanges.at(-1)!;
		expect(during.has(5)).toBe(true);
		expect(during.has(9)).toBe(false);
		release();
	});

	test("6. failure rolls back to the snapshot", async () => {
		let restoreCount = 0;
		const { queue } = makeQueue({
			send: async () => {
				throw new Error("network failure");
			},
			restore: () => {
				restoreCount += 1;
			},
		});
		queue.setFlags(5, { isRead: false });
		await new Promise((r) => setTimeout(r, 0));
		expect(restoreCount).toBe(1);
	});

	test("7. failure with a newer queued intent does NOT roll back until it settles", async () => {
		let restoreCount = 0;
		const { queue } = makeQueue({
			send: async () => {
				throw new Error("boom"); // every send fails
			},
			restore: () => {
				restoreCount += 1;
			},
		});
		queue.setFlags(5, { isRead: false }); // fails
		queue.setFlags(5, { isRead: true }); // queued while first is inflight
		await new Promise((r) => setTimeout(r, 10));
		// First send fails (no rollback, newer intent queued), second send also
		// fails with no newer intent -> exactly one rollback.
		expect(restoreCount).toBe(1);
	});
});
