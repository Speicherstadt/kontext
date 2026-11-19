/** Tasks with their projects, boards and links (src/features/tasks/, server/tasks/). */

import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamps } from "./columns";

/**
 * Tasks (src/features/tasks/): each belongs to one Stalwart account – the own mailbox or a shared
 * one like info@ – and whoever can open that account sees it. `status` is the board column,
 * `position` the order within it; the checklist is JSON.
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    /** One of the account's projects (task_projects), or null for the account's own board. */
    projectId: text("project_id"),
    title: text("title").notNull(),
    notes: text("notes").notNull(),
    status: text("status").notNull(),
    position: real("position").notNull(),
    /** The personal account id of the person responsible, or null. */
    assigneeId: text("assignee_id"),
    /** YYYY-MM-DD, and HH:MM when the task is due at a time. */
    dueDate: text("due_date"),
    dueTime: text("due_time"),
    checklist: text("checklist").notNull(),
    createdBy: text("created_by").notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    /** Who gave the task its assignee, and when: what the bell shows as "Neu für dich". */
    assignedBy: text("assigned_by"),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" }),
    /** When to remind the assignee by push; `remindedAt` once that happened. */
    remindAt: integer("remind_at", { mode: "timestamp_ms" }),
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    /** daily, weekdays, weekly, monthly, yearly: done, it comes again (server/model/tasks.ts). */
    repeat: text("repeat"),
    /**
     * Made in a CalDAV client: its file name there (without ".ics") and its UID, kept so the
     * client finds it again. Tasks made in Kontext are "<id>.ics" with their id as UID.
     */
    davName: text("dav_name"),
    davUid: text("dav_uid"),
    ...timestamps,
  },
  (table) => [
    index("tasks_account").on(table.accountId),
    index("tasks_project").on(table.projectId),
    index("tasks_remind_at").on(table.remindAt),
    index("tasks_dav_name").on(table.accountId, table.davName),
  ],
);

/**
 * An account's further boards ("Baustelle Hoffmann"), so the tasks of one job stay apart; whoever
 * can open the account sees them. `columns` as in task_boards, null for the built-in ones.
 */
export const taskProjects = sqliteTable(
  "task_projects",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    columns: text("columns"),
    ...timestamps,
  },
  (table) => [index("task_projects_account").on(table.accountId)],
);

/**
 * An account's own board's columns, as JSON; a board without a row has the four built-in ones.
 */
export const taskBoards = sqliteTable("task_boards", {
  accountId: text("account_id").primaryKey(),
  columns: text("columns").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** What a task is about: a mail (with its thread), a contact, an appointment. */
export const taskLinks = sqliteTable(
  "task_links",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    accountId: text("account_id").notNull(),
    ref: text("ref").notNull(),
    /** The mail's thread, so every mail of the conversation shows the task. */
    threadId: text("thread_id"),
    /** A snapshot to show without loading the mail, e.g. its subject and sender. */
    label: text("label").notNull(),
    detail: text("detail").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.kind, table.ref] }),
    index("task_links_ref").on(table.ref),
  ],
);
