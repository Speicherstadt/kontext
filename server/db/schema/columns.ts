/** Columns many tables share. */
import { integer } from "drizzle-orm/sqlite-core";

export const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};
