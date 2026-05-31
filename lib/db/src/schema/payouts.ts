import { pgTable, text, serial, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const payoutStatusEnum = pgEnum("payout_status", ["pending", "approved", "rejected"]);

export const payoutRequestsTable = pgTable("payout_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: real("amount").notNull(),
  phoneNumber: text("phone_number").notNull(),
  status: payoutStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPayoutRequestSchema = createInsertSchema(payoutRequestsTable).omit({ id: true, createdAt: true });
export type InsertPayoutRequest = z.infer<typeof insertPayoutRequestSchema>;
export type PayoutRequest = typeof payoutRequestsTable.$inferSelect;
