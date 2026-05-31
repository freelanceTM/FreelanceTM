import { pgTable, text, serial, timestamp, integer, real, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["buyer", "freelancer", "both", "admin"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("buyer"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  location: text("location"),
  skills: text("skills").array().notNull().default([]),
  rating: real("rating"),
  reviewCount: integer("review_count").notNull().default(0),
  completedOrders: integer("completed_orders").notNull().default(0),
  balance: real("balance").notNull().default(0),
  pendingBalance: real("pending_balance").notNull().default(0),
  telegramChatId: text("telegram_chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
