import { z } from "zod";

import { idSchema } from "./common.ts";

/** Entry state flags that can be changed by the user. */
export const entryFlagsSchema = z
	.object({
		isRead: z.boolean().optional(),
		isStarred: z.boolean().optional(),
		isArchived: z.boolean().optional(),
	})
	.refine(
		(v) => v.isRead !== undefined || v.isStarred !== undefined || v.isArchived !== undefined,
		{ message: "At least one flag must be provided" },
	);

export type EntryFlags = z.infer<typeof entryFlagsSchema>;

/** Update flags on a single entry. */
export const updateEntrySchema = z.object({
	...entryFlagsSchema.shape,
});

export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

/** Update flags on many entries at once. */
export const bulkUpdateEntriesSchema = z.object({
	entryIds: z.array(idSchema).min(1).max(500),
	...entryFlagsSchema.shape,
});

export type BulkUpdateEntriesInput = z.infer<typeof bulkUpdateEntriesSchema>;

/** Add a tag to an entry. */
export const addTagSchema = z.object({
	entryId: idSchema,
	tag: z.string().trim().min(1).max(50),
});

/** Remove a tag from an entry. */
export const removeTagSchema = z.object({
	entryId: idSchema,
	tag: z.string().trim().min(1).max(50),
});
