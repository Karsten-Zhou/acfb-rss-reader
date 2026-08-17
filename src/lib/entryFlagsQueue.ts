/**
 * Per-entry, last-intent-wins coordinator for entry flag mutations.
 *
 * Every entry-flag mutation (open→mark-read, toolbar buttons, keyboard
 * shortcuts) goes through this single queue. It guarantees:
 *
 * - at most one PATCH in flight per entry (serialized per entry);
 * - repeated actions on the same entry coalesce to the LATEST desired flags,
 *   so "Unread -> Read -> Unread" sends `{isRead:true}` then `{isRead:false}`
 *   and never lets an intermediate completion overwrite the final intent;
 * - optimistic cache state reflects the merged intent immediately, and is
 *   rolled back to the pre-cycle snapshot only when the cycle fails with no
 *   newer intent queued;
 * - pending state is exposed per entry/field (never one global scalar), so
 *   one mutation's lifecycle can never clear another's loading state.
 *
 * This module is framework-agnostic (no Vue/TanStack imports) so the
 * coordination rules are unit-testable in isolation.
 */

export interface EntryFlagsInput {
	isRead?: boolean;
	isStarred?: boolean;
	isArchived?: boolean;
}

const FLAG_FIELDS = ["isRead", "isStarred", "isArchived"] as const;
type FlagField = (typeof FLAG_FIELDS)[number];

export interface EntryFlagsQueueDeps {
	/** Send the desired flag state to the server. */
	send: (entryId: number, flags: EntryFlagsInput) => Promise<void>;
	/** Apply optimistic cache updates for the given (already merged) intent. */
	applyOptimistic: (entryId: number, flags: EntryFlagsInput) => void;
	/** Capture a cache snapshot before the first optimistic apply of a cycle. */
	snapshot: () => unknown;
	/** Restore a snapshot captured by `snapshot`. */
	restore: (snapshot: unknown) => void;
	/** Called after a successful send (e.g. reconcile secondary counts). */
	onSuccess: (entryId: number) => void;
	/** Called whenever the per-entry pending flags change. */
	onPendingChange: (pending: ReadonlyMap<number, EntryFlagsInput>) => void;
}

interface EntryState {
	/** Latest desired flags waiting to be sent. */
	queued: EntryFlagsInput;
	/** Flags currently being sent. */
	inflight: EntryFlagsInput | null;
	/** Cache snapshot taken before this cycle's first optimistic apply. */
	snapshot: unknown;
	snapshotTaken: boolean;
	/** Callbacks to run when the entry's cycle finishes (settled/superseded). */
	settleCallbacks: Array<() => void>;
}

export interface EntryFlagsQueue {
	/** Request a desired flag state for an entry (last write wins per field). */
	setFlags(entryId: number, flags: EntryFlagsInput, onSettled?: () => void): void;
	/** Latest per-entry pending flags (inflight ∪ queued). */
	readonly pending: ReadonlyMap<number, EntryFlagsInput>;
}

export function createEntryFlagQueue(deps: EntryFlagsQueueDeps): EntryFlagsQueue {
	const states = new Map<number, EntryState>();
	const pending = new Map<number, EntryFlagsInput>();

	function notify(): void {
		pending.clear();
		for (const [entryId, state] of states) {
			pending.set(entryId, { ...state.inflight, ...state.queued });
		}
		deps.onPendingChange(pending);
	}

	function endCycle(entryId: number, state: EntryState): void {
		const callbacks = state.settleCallbacks;
		states.delete(entryId);
		notify();
		for (const cb of callbacks) cb();
	}

	async function pump(entryId: number): Promise<void> {
		const state = states.get(entryId);
		if (!state || state.inflight) return;

		if (Object.keys(state.queued).length === 0) {
			endCycle(entryId, state);
			return;
		}

		state.inflight = state.queued;
		state.queued = {};
		notify();

		let failed = false;
		try {
			await deps.send(entryId, state.inflight);
			deps.onSuccess(entryId);
		} catch {
			failed = true;
		}

		state.inflight = null;

		// Roll back only when no newer intent superseded the failed one. A
		// newer queued intent re-applies optimistic state when it is sent.
		if (failed && Object.keys(state.queued).length === 0) {
			deps.restore(state.snapshot);
			endCycle(entryId, state);
			return;
		}

		notify();
		if (Object.keys(state.queued).length > 0) await pump(entryId);
		else endCycle(entryId, state);
	}

	function setFlags(entryId: number, flags: EntryFlagsInput, onSettled?: () => void): void {
		let state = states.get(entryId);
		if (!state) {
			state = {
				queued: {},
				inflight: null,
				snapshot: undefined,
				snapshotTaken: false,
				settleCallbacks: [],
			};
			states.set(entryId, state);
		}

		// Capture the pre-cycle snapshot once, before the first optimistic
		// apply, so rollback restores the true pre-mutation state.
		if (!state.snapshotTaken) {
			state.snapshot = deps.snapshot();
			state.snapshotTaken = true;
		}

		if (onSettled) state.settleCallbacks.push(onSettled);

		for (const field of FLAG_FIELDS) {
			if (flags[field] !== undefined) {
				state.queued[field] = flags[field];
			}
		}

		// Reflect the merged intent optimistically right away so the UI shows
		// the final desired state even while a previous PATCH is in flight.
		deps.applyOptimistic(entryId, state.queued);
		notify();
		void pump(entryId);
	}

	return { setFlags, pending };
}

export type FlagFieldName = FlagField;
