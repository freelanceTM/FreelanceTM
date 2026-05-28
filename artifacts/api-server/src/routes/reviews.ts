import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, reviewsTable, usersTable, gigsTable } from "@workspace/db";
import {
  CreateReviewBody,
  ListGigReviewsParams,
  ListGigReviewsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reviews/gig/:gigId", async (req, res): Promise<void> => {
  const params = ListGigReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const reviews = await db.select().from(reviewsTable).where(eq(reviewsTable.gigId, params.data.gigId));

  const reviewerIds = [...new Set(reviews.map(r => r.reviewerId))];
  const reviewers = reviewerIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, reviewerIds))
    : [];

  const reviewerMap = Object.fromEntries(reviewers.map(u => [u.id, u]));

  const mapped = reviews.map(r => ({
    ...r,
    reviewerUsername: reviewerMap[r.reviewerId]?.username ?? null,
    reviewerAvatarUrl: reviewerMap[r.reviewerId]?.avatarUrl ?? null,
    comment: r.comment ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  res.json(ListGigReviewsResponse.parse(mapped));
});

router.post("/reviews", async (req, res): Promise<void> => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const reviewerId = parseInt(String(userId), 10);

  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [review] = await db.insert(reviewsTable).values({
    ...parsed.data,
    reviewerId,
    comment: parsed.data.comment ?? null,
  }).returning();

  const reviews = await db.select().from(reviewsTable).where(eq(reviewsTable.gigId, parsed.data.gigId));
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  await db.update(gigsTable)
    .set({ rating: avgRating, reviewCount: reviews.length })
    .where(eq(gigsTable.id, parsed.data.gigId));

  const [reviewer] = await db.select().from(usersTable).where(eq(usersTable.id, reviewerId));

  const mapped = {
    ...review,
    reviewerUsername: reviewer?.username ?? null,
    reviewerAvatarUrl: reviewer?.avatarUrl ?? null,
    comment: review.comment ?? null,
    createdAt: review.createdAt.toISOString(),
  };

  res.status(201).json(mapped);
});

export default router;
