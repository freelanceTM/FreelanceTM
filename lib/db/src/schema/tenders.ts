import { pgTable, text, serial, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const tenderStatusEnum = pgEnum("tender_status", ["open", "in_progress", "closed"]);

export const tendersTable = pgTable("tenders", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  budget: real("budget").notNull(),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  status: tenderStatusEnum("status").notNull().default("open"),
  proposalCount: integer("proposal_count").notNull().default(0),
  deadline: timestamp("deadline", { withTimezone: true }),
  skills: text("skills").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTenderSchema = createInsertSchema(tendersTable).omit({ id: true, createdAt: true });
export type InsertTender = z.infer<typeof insertTenderSchema>;
export type Tender = typeof tendersTable.$inferSelect;
