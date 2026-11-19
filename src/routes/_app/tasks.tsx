import { createFileRoute } from "@tanstack/react-router";
import { useAssignedTasksSeen } from "@/features/notifications/app-badges";
import { tasksSearchSchema } from "@/features/tasks/search-params";
import { TasksPage } from "@/features/tasks/tasks-page";

export const Route = createFileRoute("/_app/tasks")({
  validateSearch: tasksSearchSchema,
  component: TasksRoute,
});

function TasksRoute() {
  // The tasks given to me are in front of me now, their badge goes; called here so that the
  // tasks feature does not depend on the notifications.
  useAssignedTasksSeen();
  return <TasksPage search={Route.useSearch()} />;
}
