/**
 * Tasks: the routes of the boards, reminders, tasks from mail rules, and the boards over CalDAV for
 * Thunderbird and phone apps.
 */

import type { Hono } from "hono";
import type { Grants } from "../auth";
import { createAppPasswordRoutes } from "../dav/app-password-routes";
import { createAppPasswords } from "../dav/app-passwords";
import { createDavAuth } from "../dav/auth";
import { createDavRoutes } from "../dav/routes";
import type { Db } from "../db";
import type { Env } from "../env";
import type { Hub } from "../live/hub";
import type { McpDeps } from "../mcp/routes";
import type { Pusher } from "../push/pusher";
import type { createSessionInfo } from "../session-info";
import type { SnoozeStore } from "../snooze/store";
import { tokenOrUnavailable } from "../stalwart-away";
import { createRuleTasks } from "../tasks/from-rules";
import { createTaskReminder } from "../tasks/notices";
import { createTaskRoutes } from "../tasks/routes";
import type { TaskStore } from "../tasks/store";

/** The routes of the task boards for the signed-in person; reminders go out every minute. */
export const mountTasks = (
  app: Hono,
  deps: {
    env: Env;
    tasks: TaskStore;
    hub: Hub;
    pusher: Pusher;
    session: ReturnType<typeof createSessionInfo>;
  },
) => {
  const { tasks, hub, pusher, session } = deps;
  // Task reminders go out every minute, also with nobody signed in.
  const reminder = createTaskReminder({ store: tasks, notify: pusher.notify });
  setInterval(() => void reminder.tick(), deps.env.REMINDER_TICK_MS).unref();
  const taskNotices = {
    store: tasks,
    notify: pusher.notify,
    changed: (accountId: string, assignees: string[]) =>
      hub.publish(
        { type: "tasks", accountId },
        (viewer) => viewer.accountIds.includes(accountId) || assignees.includes(viewer.me),
      ),
  };
  app.route(
    "/api/tasks",
    createTaskRoutes({
      ...taskNotices,
      accountsOf: session.accountsOf,
      nameOf: async (request) => (await session.infoOf(request))?.name ?? "",
    }),
  );
  return taskNotices;
};

export type TaskNotices = ReturnType<typeof mountTasks>;

/**
 * The task boards for Thunderbird and phone apps (CalDAV), signed in with the mail password or,
 * with two-step sign-in, an app password made in the settings. Mails a rule marked "Aufgabe
 * anlegen" become tasks, every minute, also with nobody signed in.
 */
export const mountDav = (
  app: Hono,
  deps: {
    env: Env;
    db: Db;
    grants: Grants;
    tasks: TaskStore;
    snoozes: SnoozeStore;
    changed: (accountId: string) => void;
    signIn: Pick<McpDeps, "userOf" | "login" | "mayTryPassword">;
  },
) => {
  const { env, grants, tasks, changed } = deps;
  const appPasswords = createAppPasswords(deps.db, undefined, grants.end);
  const { userOf, login, mayTryPassword } = deps.signIn;
  app.route(
    "/api/app-passwords",
    createAppPasswordRoutes({ appPasswords, grants, userOf, login, mayTryPassword }),
  );
  app.all("/.well-known/caldav", (c) => c.redirect("/dav/", 301));
  app.route(
    "/dav",
    createDavRoutes({
      auth: createDavAuth(env, undefined, undefined, {
        resolve: appPasswords.resolve,
        tokenOf: (sessionId) => tokenOrUnavailable(grants, sessionId),
      }),
      store: tasks,
      changed,
    }),
  );
  const ruleTasks = createRuleTasks({
    env,
    grants,
    sessions: async () => (await deps.snoozes.sessionsFor("")).map(({ sessionId }) => sessionId),
    store: tasks,
    changed,
  });
  setInterval(() => void ruleTasks.tick(), env.RULE_TASK_TICK_MS).unref();
};
