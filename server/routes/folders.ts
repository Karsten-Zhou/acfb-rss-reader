import { Hono } from "hono";

import { createFolderSchema, idSchema, updateFolderSchema } from "../../shared/index.ts";
import { HttpError } from "../errors.ts";
import { createFolder, deleteFolder, listFolders, renameFolder } from "../feeds/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

export const folderRoutes = new Hono<AppEnv>();

/** GET /api/folders — folders with feed + unread counts. */
folderRoutes.get("/", requireAuth(), async (c) => {
	const folders = await listFolders(c.get("db"));
	return c.json({ folders });
});

/** POST /api/folders — create a folder. */
folderRoutes.post("/", requireAuth(), async (c) => {
	const input = createFolderSchema.parse(await c.req.json());
	const folder = await createFolder(c.get("db"), input.name);
	return c.json({ folder }, 201);
});

/** PATCH /api/folders/:id — rename a folder. */
folderRoutes.patch("/:id", requireAuth(), async (c) => {
	const id = idSchema.parse(c.req.param("id"));
	const input = updateFolderSchema.parse(await c.req.json());
	const folder = await renameFolder(c.get("db"), id, input.name);
	if (!folder) throw new HttpError(404, "NOT_FOUND", "Folder not found");
	return c.json({ folder });
});

/** DELETE /api/folders/:id — delete a folder (feeds become ungrouped). */
folderRoutes.delete("/:id", requireAuth(), async (c) => {
	const id = idSchema.parse(c.req.param("id"));
	const deleted = await deleteFolder(c.get("db"), id);
	if (!deleted) throw new HttpError(404, "NOT_FOUND", "Folder not found");
	return c.json({ ok: true });
});
