import { Router, type IRouter } from "express";
import { db, categoriesTable, gigsTable } from "@workspace/db";
import { count, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      iconName: categoriesTable.iconName,
      gigCount: count(gigsTable.id),
    })
    .from(categoriesTable)
    .leftJoin(gigsTable, eq(gigsTable.categoryId, categoriesTable.id))
    .groupBy(categoriesTable.id, categoriesTable.name, categoriesTable.slug, categoriesTable.iconName)
    .orderBy(categoriesTable.name);

  res.json(rows);
});

export default router;
