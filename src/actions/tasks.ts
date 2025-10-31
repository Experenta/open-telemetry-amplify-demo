"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";
import { trace } from "@opentelemetry/api";

type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export async function getTasksByProjectId(projectId: string) {
	try {
		const { data: tasks, errors } =
			await cookieBasedClient.models.Task.list({
				filter: { projectId: { eq: projectId } },
				selectionSet: [
					"id",
					"title",
					"description",
					"status",
					"priority",
					"dueDate",
					"createdAt",
					"updatedAt",
					"projectId",
				],
			});

		if (errors) {
			console.error("Get tasks errors:", errors);
			return {
				success: false,
				error: "Failed to fetch tasks",
				tasks: [],
			};
		}

		return { success: true, tasks: tasks || [] };
	} catch (error: unknown) {
		console.error("Get tasks error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to fetch tasks",
			tasks: [],
		};
	}
}

export async function getTaskById(id: string) {
	try {
		const { data: task, errors } = await cookieBasedClient.models.Task.get(
			{
				id,
			},
			{
				selectionSet: [
					"id",
					"title",
					"description",
					"status",
					"priority",
					"dueDate",
					"createdAt",
					"updatedAt",
					"projectId",
				],
			}
		);

		if (errors) {
			console.error("Get task errors:", errors);
			return {
				success: false,
				error: "Failed to fetch task",
				task: null,
			};
		}

		return { success: true, task };
	} catch (error: unknown) {
		console.error("Get task error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to fetch task",
			task: null,
		};
	}
}

export async function createTask(formData: FormData) {
	const projectId = formData.get("projectId") as string;
	const title = formData.get("title") as string;
	const description = formData.get("description") as string;
	const status = (formData.get("status") as TaskStatus) || "TODO";
	const priority = (formData.get("priority") as TaskPriority) || "MEDIUM";
	const dueDate = formData.get("dueDate") as string;

	console.log("Form data:", formData);

	if (!title?.trim()) {
		return { success: false, error: "Task title is required" };
	}

	if (!projectId) {
		return { success: false, error: "Project ID is required" };
	}

	try {
		const { data: task, errors } =
			await cookieBasedClient.models.Task.create(
				{
					projectId,
					title: title.trim(),
					description: description?.trim() || null,
					status,
					priority,
					dueDate: new Date(dueDate).toISOString(),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					selectionSet: [
						"id",
						"title",
						"description",
						"status",
						"priority",
						"dueDate",
						"createdAt",
						"updatedAt",
						"projectId",
					],
				}
			);

		if (errors) {
			console.error("Create task errors:", errors);
			return { success: false, error: "Failed to create task" };
		}

		revalidatePath(`/projects/${projectId}`);
		return { success: true, task };
	} catch (error: unknown) {
		console.error("Create task error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to create task",
		};
	}
}

export async function updateTask(id: string, formData: FormData) {
	const title = formData.get("title") as string;
	const description = formData.get("description") as string;
	const status = formData.get("status") as TaskStatus;
	const priority = formData.get("priority") as TaskPriority;
	const dueDate = formData.get("dueDate") as string;
	const projectId = formData.get("projectId") as string;

	if (!title?.trim()) {
		return { success: false, error: "Task title is required" };
	}

	try {
		const { data: task, errors } =
			await cookieBasedClient.models.Task.update(
				{
					id,
					title: title.trim(),
					description: description?.trim(),
					status,
					priority,
					dueDate: new Date(dueDate).toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					selectionSet: [
						"id",
						"title",
						"description",
						"status",
						"priority",
						"dueDate",
						"createdAt",
						"updatedAt",
						"projectId",
					],
				}
			);

		if (errors) {
			console.error("Update task errors:", errors);
			return { success: false, error: "Failed to update task" };
		}

		if (projectId) {
			revalidatePath(`/projects/${projectId}`);
		}
		return { success: true, task };
	} catch (error: unknown) {
		console.error("Update task error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to update task",
		};
	}
}

export async function deleteTask(id: string, projectId: string) {
	try {
		const { errors } = await cookieBasedClient.models.Task.delete({ id });

		if (errors) {
			console.error("Delete task errors:", errors);
			return { success: false, error: "Failed to delete task" };
		}

		revalidatePath(`/projects/${projectId}`);
		return { success: true };
	} catch (error: unknown) {
		console.error("Delete task error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to delete task",
		};
	}
}

export async function getAllTasks() {
	const tracer = trace.getTracer("tasks-actions");
	
	return await tracer.startActiveSpan("tasks.getAllTasks", async (span) => {
		try {
			span.setAttribute("action.name", "getAllTasks");
			span.setAttribute("action.type", "read");
			span.setAttribute("resource.type", "task");
			span.addEvent("tasks.fetch.started");

			const { data: tasks, errors } =
				await cookieBasedClient.models.Task.list({
					selectionSet: [
						"id",
						"title",
						"description",
						"status",
						"priority",
						"dueDate",
						"createdAt",
						"updatedAt",
						"projectId",
					],
				});

			if (errors) {
				span.setStatus({
					code: 2, // ERROR
					message: "Failed to fetch tasks",
				});
				span.recordException(new Error(JSON.stringify(errors)));
				span.addEvent("tasks.fetch.errors", {
					errorCount: errors.length.toString(),
				});
				console.error("Get all tasks errors:", errors);
				
				span.end();
				return {
					success: false,
					error: "Failed to fetch tasks",
					tasks: [],
				};
			}

			const tasksList = tasks || [];
			span.setAttribute("tasks.count", tasksList.length);
			
			// Calculate status breakdown
			const statusCounts = tasksList.reduce((acc, t) => {
				acc[t.status] = (acc[t.status] || 0) + 1;
				return acc;
			}, {} as Record<string, number>);
			
			// Calculate priority breakdown
			const priorityCounts = tasksList.reduce((acc, t) => {
				acc[t.priority] = (acc[t.priority] || 0) + 1;
				return acc;
			}, {} as Record<string, number>);

			span.setAttribute("tasks.todo", statusCounts.TODO || 0);
			span.setAttribute("tasks.in_progress", statusCounts.IN_PROGRESS || 0);
			span.setAttribute("tasks.completed", statusCounts.COMPLETED || 0);
			span.setAttribute("tasks.priority.low", priorityCounts.LOW || 0);
			span.setAttribute("tasks.priority.medium", priorityCounts.MEDIUM || 0);
			span.setAttribute("tasks.priority.high", priorityCounts.HIGH || 0);

			span.addEvent("tasks.fetch.completed", {
				tasksCount: tasksList.length.toString(),
				completedCount: (statusCounts.COMPLETED || 0).toString(),
			});
			span.setStatus({ code: 1 }); // OK

			span.end();
			return { success: true, tasks: tasksList };
		} catch (error: unknown) {
			span.setStatus({
				code: 2, // ERROR
				message: error instanceof Error ? error.message : "Unknown error",
			});
			span.recordException(error as Error);
			span.addEvent("tasks.fetch.error", {
				error: error instanceof Error ? error.message : "Unknown error",
			});
			console.error("Get all tasks error:", error);
			
			span.end();
			return {
				success: false,
				error: (error as Error).message || "Failed to fetch tasks",
				tasks: [],
			};
		}
	});
}
