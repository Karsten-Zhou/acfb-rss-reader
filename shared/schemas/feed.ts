import { z } from "zod";

import { idSchema } from "./common.ts";

/** Create a new feed subscription. */
export const createFeedSchema = z.object({
	url: z.string().url(),
	/** Optional custom label; falls back to the feed's parsed title. */
	title: z.string().trim().min(1).max(200).optional(),
	folderId: idSchema.nullable().optional(),
});

export type CreateFeedInput = z.infer<typeof createFeedSchema>;

/** Update an existing feed subscription. All fields optional. */
export const updateFeedSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		folderId: idSchema.nullable().optional(),
	})
	.refine((v) => v.title !== undefined || v.folderId !== undefined, {
		message: "At least one field must be provided",
	});

export type UpdateFeedInput = z.infer<typeof updateFeedSchema>;

/** Reorder feeds — ordered array of feed ids for the sidebar. */
export const reorderFeedsSchema = z.object({
	ids: z.array(idSchema).min(1).max(1000),
});

export type ReorderFeedsInput = z.infer<typeof reorderFeedsSchema>;

/** Create a new folder. */
export const createFolderSchema = z.object({
	name: z.string().trim().min(1).max(100),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;

/** Update a folder (rename only for now). */
export const updateFolderSchema = z.object({
	name: z.string().trim().min(1).max(100),
});

export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
