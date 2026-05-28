import { pgTable, serial, text, integer, real, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const gigStatusEnum = pgEnum("gig_status", ["draft", "active", "paused"]);

export const gigsTable = pgTable("gigs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull(),
  deliveryDays: integer("delivery_days").notNull(),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  tags: text("tags").array().notNull().default([]),
  imageUrl: text("image_url"),
  rating: real("rating"),
  reviewCount: integer("review_count").notNull().default(0),
  orderCount: integer("order_count").notNull().default(0),
  isFeatured: boolean("is_featured").notNull().default(false),
  status: gigStatusEnum("status").notNull().default("active"),
  revisions: integer("revisions").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGigSchema = createInsertSchema(gigsTable).omit({ id: true, createdAt: true, reviewCount: true, orderCount: true });
export type InsertGig = z.infer<typeof insertGigSchema>;
export type Gig = typeof gigsTable.$inferSelect;
