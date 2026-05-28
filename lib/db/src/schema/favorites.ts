import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { gigsTable } from "./gigs";

export const favoritesTable = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  gigId: integer("gig_id").notNull().references(() => gigsTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Favorite = typeof favoritesTable.$inferSelect;
