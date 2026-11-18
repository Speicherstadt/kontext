/** Rows of the tasks tables turned into tasks, projects and CalDAV entries. Pure. */
import { and, eq, isNull, type SQL } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Board, DavTask } from "./store";
import type { CheckItem, Repeat, Task, TaskLink, TaskProject } from "./tasks";

export type Row = typeof schema.tasks.$inferSelect;
export type LinkRow = typeof schema.taskLinks.$inferSelect;

export const toTask = (row: Row, links: LinkRow[]): Task => ({
  id: row.id,
  accountId: row.accountId,
  projectId: row.projectId,
  title: row.title,
  notes: row.notes,
  status: row.status,
  position: row.position,
  assigneeId: row.assigneeId,
  dueDate: row.dueDate,
  dueTime: row.dueTime,
  checklist: JSON.parse(row.checklist) as CheckItem[],
  links: links.map(({ kind, accountId, ref, threadId, label, detail }) => ({
    kind: kind as TaskLink["kind"],
    accountId,
    ref,
    threadId,
    label,
    detail,
  })),
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  completedAt: row.completedAt?.toISOString() ?? null,
  assignedBy: row.assignedBy,
  assignedAt: row.assignedAt?.toISOString() ?? null,
  remindAt: row.remindAt?.toISOString() ?? null,
  repeat: (row.repeat as Repeat | null) ?? null,
});

export const instant = (value: string | null) => (value ? new Date(value) : null);

/** The tasks on a board: its project's, or the account's without a project. */
export const onBoard = ({ accountId, projectId }: Board): SQL =>
  and(
    eq(schema.tasks.accountId, accountId),
    projectId ? eq(schema.tasks.projectId, projectId) : isNull(schema.tasks.projectId),
  )!;

export const toProject = (row: typeof schema.taskProjects.$inferSelect): TaskProject => ({
  id: row.id,
  accountId: row.accountId,
  name: row.name,
});

export const davOf = (row: Row, task: Task): DavTask => ({
  task,
  name: row.davName ?? row.id,
  uid: row.davUid ?? row.id,
});
