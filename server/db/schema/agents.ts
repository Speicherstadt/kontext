/** Agents over MCP (server/mcp/): their connections and what they changed. */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { session, user } from "./auth";

/**
 * Agents connected over MCP (server/mcp/): an access key or an OAuth client. Each connection has
 * its own sign-in session and so its own Stalwart grant; deleting the session takes the access
 * away (the connection and its log go with it). Of a key only its hash is kept.
 */
export const mcpKey = sqliteTable(
  "mcp_key",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 of an access key; null for an OAuth connection. */
    keyHash: text("key_hash").unique(),
    /** The OAuth client (server/mcp/oauth.ts); null for an access key. */
    clientId: text("client_id"),
    /** What the agent may do, space-separated: "read", "write". */
    scopes: text("scopes").notNull().default("read"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("mcp_key_user").on(table.userId),
    index("mcp_key_client").on(table.userId, table.clientId),
  ],
);

/** What agents changed: one line per write, shown with the connection in the settings. */
export const mcpLog = sqliteTable(
  "mcp_log",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => mcpKey.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    summary: text("summary").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("mcp_log_connection").on(table.connectionId, table.createdAt)],
);
