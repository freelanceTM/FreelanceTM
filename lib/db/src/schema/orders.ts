import { pgTable, serial, integer, real, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { gigsTable } from "./gigs";

export const orderStatusEnum = pgEnum("order_status", [
  "pending", "active", "delivered", "completed", "cancelled", "disputed"
]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  gigId: integer("gig_id").notNull().references(() => gigsTable.id),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  status: orderStatusEnum("status").notNull().default("pending"),
  totalPrice: real("total_price").notNull(),
  requirements: text("requirements"),
  deliveryDays: integer("delivery_days").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
