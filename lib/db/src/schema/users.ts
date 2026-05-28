import { pgTable, serial, text, integer, timestamp, real, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["freelancer", "client", "both"]);
export const userLevelEnum = pgEnum("user_level", ["new", "rising", "top", "pro"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("client"),
  skills: text("skills").array().notNull().default([]),
  telegramUsername: text("telegram_username"),
  telegramChatId: text("telegram_chat_id"),
  rating: real("rating"),
  completedOrders: integer("completed_orders").notNull().default(0),
  responseTime: integer("response_time"),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  level: userLevelEnum("level").notNull().default("new"),
  portfolioUrls: text("portfolio_urls").array().notNull().default([]),
  country: text("country").default("TM"),
  languages: text("languages").array().notNull().default(["ru"]),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
