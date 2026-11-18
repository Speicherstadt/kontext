import { createFileRoute } from "@tanstack/react-router";
import { tasksSearchSchema } from "@/features/tasks/search-params";
import { TasksPage } from "@/features/tasks/tasks-page";

export const Route = createFileRoute("/_app/tasks")({
  validateSearch: tasksSearchSchema,
  component: TasksRoute,
});

function TasksRoute() {
  return <TasksPage search={Route.useSearch()} />;
}
