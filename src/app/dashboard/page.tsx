import { MainLayout } from "@/components/layout/MainLayout";
import { getCurrentUserAction } from "@/actions/auth";
import { redirect } from "next/navigation";
import { getProjects } from "@/actions/projects";
import { getAllTasks } from "@/actions/tasks";
import { getAllSubtasks } from "@/actions/subtasks";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { TaskStatusChart } from "@/components/dashboard/TaskStatusChart";
import { ProjectProgressChart } from "@/components/dashboard/ProjectProgressChart";
import { ProductivityTrend } from "@/components/dashboard/ProductivityTrend";

import { trace } from "@opentelemetry/api";

export default async function DashboardPage() {
	const tracer = trace.getTracer("dashboard-page");

	return await tracer.startActiveSpan(
		"dashboard.page.render",
		async (span) => {
			try {
				span.setAttribute("http.route", "/dashboard");
				span.setAttribute("next.page", "DashboardPage");
				span.addEvent("dashboard.render.started");

				// Authentication check
				span.addEvent("dashboard.auth.check.started");
				const { isAuthenticated } = await getCurrentUserAction();
				span.addEvent("dashboard.auth.check.completed", {
					isAuthenticated: isAuthenticated.toString(),
				});

				if (!isAuthenticated) {
					span.setStatus({ code: 1 });
					span.addEvent("dashboard.auth.redirect", {
						redirectTo: "/auth/sign-in",
					});
					span.end();
					redirect("/auth/sign-in");
				}

				// Parallel data fetching
				span.addEvent("dashboard.data.fetch.started");
				const [projectsResult, tasksResult, subtasksResult] =
					await Promise.all([
						getProjects(),
						getAllTasks(),
						getAllSubtasks(),
					]);

				const projects = projectsResult.projects || [];
				const tasks = tasksResult.tasks || [];
				const subtasks = subtasksResult.subtasks || [];

				span.addEvent("dashboard.data.fetch.completed", {
					projectsCount: projects.length.toString(),
					tasksCount: tasks.length.toString(),
					subtasksCount: subtasks.length.toString(),
				});

				// Set attributes for analytics
				span.setAttribute("dashboard.projects.count", projects.length);
				span.setAttribute("dashboard.tasks.count", tasks.length);
				span.setAttribute("dashboard.subtasks.count", subtasks.length);

				// Calculate stats for additional context
				const activeProjects = projects.filter(
					(p) => p.status === "ACTIVE"
				).length;
				const completedTasks = tasks.filter(
					(t) => t.status === "COMPLETED"
				).length;
				const completedSubtasks = subtasks.filter(
					(s) => s.isCompleted
				).length;

				span.setAttribute("dashboard.projects.active", activeProjects);
				span.setAttribute("dashboard.tasks.completed", completedTasks);
				span.setAttribute(
					"dashboard.subtasks.completed",
					completedSubtasks
				);

				span.addEvent("dashboard.render.completed");
				span.setStatus({ code: 1 }); // OK

				return (
					<MainLayout>
						<div className="space-y-6">
							<div>
								<h1 className="text-3xl font-bold">
									Dashboard
								</h1>
								<p className="text-gray-600 mt-1">
									Track your productivity and project progress
								</p>
							</div>

							<DashboardStats
								projects={projects}
								tasks={tasks}
								subtasks={subtasks}
							/>

							<div className="grid gap-6 md:grid-cols-2">
								<TaskStatusChart tasks={tasks} />
								<ProjectProgressChart projects={projects} />
							</div>

							<ProductivityTrend tasks={tasks} />
						</div>
					</MainLayout>
				);
			} catch (error: unknown) {
				span.setStatus({
					code: 2, // ERROR
					message:
						error instanceof Error
							? error.message
							: "Unknown error",
				});
				span.recordException(error as Error);
				span.addEvent("dashboard.render.error", {
					error:
						error instanceof Error
							? error.message
							: "Unknown error",
				});
				throw error;
			} finally {
				span.end();
			}
		}
	);
}
