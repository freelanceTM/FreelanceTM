import { pgTable, text, serial, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ocrStatusEnum = pgEnum("ocr_status", ["pending", "verified", "failed"]);
export const topupAdminStatusEnum = pgEnum("topup_admin_status", ["pending", "approved", "rejected"]);

export const topupRequestsTable = pgTable("topup_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: real("amount").notNull(),
  screenshotUrl: text("screenshot_url"),
  ocrStatus: ocrStatusEnum("ocr_status").notNull().default("pending"),
  adminStatus: topupAdminStatusEnum("admin_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTopupRequestSchema = createInsertSchema(topupRequestsTable).omit({ id: true, createdAt: true });
export type InsertTopupRequest = z.infer<typeof insertTopupRequestSchema>;
export type TopupRequest = typeof topupRequestsTable.$inferSelect;
