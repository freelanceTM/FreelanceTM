import { Router, type IRouter } from "express";
import { eq, sql, inArray, desc } from "drizzle-orm";
import { db, reviewsTable, usersTable, gigsTable, ordersTable } from "@workspace/db";
import {
  CreateReviewBody,
  ListGigReviewsParams,
  ListGigReviewsResponse,
} from "@workspace/api-zod";
import { extractUser, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// ─── LIST REVIEWS FOR A GIG ──────────────────────────────────────────────────
router.get("/reviews/gig/:gigId", async (req, res): Promise<void> => {
  const params = ListGigReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.gigId, params.data.gigId))
    .orderBy(desc(reviewsTable.createdAt));

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

// ─── LIST REVIEWS FOR A SELLER ───────────────────────────────────────────────
router.get("/reviews/seller/:sellerId", async (req, res): Promise<void> => {
  const sellerId = parseInt(req.params.sellerId, 10);
  if (isNaN(sellerId) || sellerId <= 0) {
    res.status(400).json({ error: "Invalid seller id" });
    return;
  }

  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.sellerId, sellerId))
    .orderBy(desc(reviewsTable.createdAt))
    .limit(20);

  const buyerIds = [...new Set(reviews.map(r => r.buyerId))];
  const buyers = buyerIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, buyerIds))
    : [];

  const gigIds = [...new Set(reviews.map(r => r.gigId))];
  const gigs = gigIds.length > 0
    ? await db.select({ id: gigsTable.id, title: gigsTable.title }).from(gigsTable).where(inArray(gigsTable.id, gigIds))
    : [];

  const buyerMap = Object.fromEntries(buyers.map(u => [u.id, u]));
  const gigMap = Object.fromEntries(gigs.map(g => [g.id, g]));

  const mapped = reviews.map(r => ({
    id: r.id,
    orderId: r.orderId,
    gigId: r.gigId,
    gigTitle: gigMap[r.gigId]?.title ?? null,
    sellerId: r.sellerId,
    buyerId: r.buyerId,
    rating: r.rating,
    comment: r.comment ?? null,
    buyerUsername: buyerMap[r.buyerId]?.username ?? null,
    buyerAvatarUrl: buyerMap[r.buyerId]?.avatarUrl ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  res.json(mapped);
});

// ─── CREATE REVIEW ────────────────────────────────────────────────────────────
router.post("/reviews", extractUser, requireAuth, async (req, res): Promise<void> => {
  const buyerId = req.userId!;

  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { gigId, orderId, rating, comment } = parsed.data;

  // Verify order exists, is completed, and belongs to this buyer
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.buyerId !== buyerId) {
    res.status(403).json({ error: "Only the buyer can leave a review" });
    return;
  }
  if (order.status !== "completed") {
    res.status(400).json({ error: "Review can only be submitted for completed orders" });
    return;
  }

  // Prevent duplicate review for the same order
  const [existing] = await db.select().from(reviewsTable).where(eq(reviewsTable.orderId, orderId));
  if (existing) {
    res.status(409).json({ error: "A review for this order already exists" });
    return;
  }

  const sellerId = order.sellerId;

  // Insert review and atomically update seller + gig ratings in a transaction
  const review = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(reviewsTable).values({
      gigId,
      orderId,
      sellerId,
      buyerId,
      reviewerId: buyerId,
      rating,
      comment: comment ?? null,
    }).returning();

    // Recalculate seller's overall rating across all their reviews
    const sellerReviews = await tx
      .select({ rating: reviewsTable.rating })
      .from(reviewsTable)
      .where(eq(reviewsTable.sellerId, sellerId));

    const sellerAvg = sellerReviews.reduce((s, r) => s + r.rating, 0) / sellerReviews.length;

    await tx.update(usersTable)
      .set({
        rating: Math.round(sellerAvg * 10) / 10,
        reviewCount: sellerReviews.length,
      })
      .where(eq(usersTable.id, sellerId));

    // Recalculate gig rating for this specific gig
    const gigReviews = await tx
      .select({ rating: reviewsTable.rating })
      .from(reviewsTable)
      .where(eq(reviewsTable.gigId, gigId));

    const gigAvg = gigReviews.reduce((s, r) => s + r.rating, 0) / gigReviews.length;

    await tx.update(gigsTable)
      .set({ rating: gigAvg, reviewCount: gigReviews.length })
      .where(eq(gigsTable.id, gigId));

    return inserted;
  });

  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, buyerId));

  res.status(201).json({
    id: review.id,
    gigId: review.gigId,
    orderId: review.orderId,
    sellerId: review.sellerId,
    buyerId: review.buyerId,
    reviewerId: review.reviewerId,
    reviewerUsername: buyer?.username ?? null,
    reviewerAvatarUrl: buyer?.avatarUrl ?? null,
    rating: review.rating,
    comment: review.comment ?? null,
    createdAt: review.createdAt.toISOString(),
  });
});

export default router;
