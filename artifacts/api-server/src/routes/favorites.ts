import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, favoritesTable } from "@workspace/db";
import {
  AddFavoriteBody,
  RemoveFavoriteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/favorites", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(userId), 10);

  const favs = await db.select().from(favoritesTable).where(eq(favoritesTable.userId, id));
  res.json(favs.map(f => f.gigId));
});

router.post("/favorites", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(userId), 10);

  const parsed = AddFavoriteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Upsert — ignore if already exists
  const existing = await db.select().from(favoritesTable)
    .where(and(eq(favoritesTable.userId, id), eq(favoritesTable.gigId, parsed.data.gigId)));

  if (existing.length === 0) {
    await db.insert(favoritesTable).values({ userId: id, gigId: parsed.data.gigId });
  }

  const favs = await db.select().from(favoritesTable).where(eq(favoritesTable.userId, id));
  res.json(favs.map(f => f.gigId));
});

router.delete("/favorites/:gigId", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(userId), 10);

  const params = RemoveFavoriteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(favoritesTable)
    .where(and(eq(favoritesTable.userId, id), eq(favoritesTable.gigId, params.data.gigId)));

  const favs = await db.select().from(favoritesTable).where(eq(favoritesTable.userId, id));
  res.json(favs.map(f => f.gigId));
});

export default router;
