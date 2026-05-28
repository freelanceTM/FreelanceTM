import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { gigsTable } from "./gigs";
import { ordersTable } from "./orders";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  gigId: integer("gig_id").notNull().references(() => gigsTable.id),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  reviewerId: integer("reviewer_id").notNull().references(() => usersTable.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true, createdAt: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;
