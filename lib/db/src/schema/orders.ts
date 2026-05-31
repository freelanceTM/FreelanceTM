import { pgTable, text, serial, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { gigsTable } from "./gigs";
import { tendersTable, tenderBidsTable } from "./tenders";

export const orderStatusEnum = pgEnum("order_status", ["active", "delivered", "completed", "revision", "cancelled"]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  // Gig-based order (nullable — null for tender orders)
  gigId: integer("gig_id").references(() => gigsTable.id),
  // Tender-based order fields (both null for gig orders)
  tenderId: integer("tender_id").references(() => tendersTable.id),
  tenderBidId: integer("tender_bid_id").references(() => tenderBidsTable.id),
  // Common fields
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  price: real("price").notNull(),
  status: orderStatusEnum("status").notNull().default("active"),
  deliveryDays: integer("delivery_days").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  deliveryNote: text("delivery_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
