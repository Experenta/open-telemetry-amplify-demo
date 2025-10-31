"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";

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
	try {
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
			console.error("Get all tasks errors:", errors);
			return {
				success: false,
				error: "Failed to fetch tasks",
				tasks: [],
			};
		}

		return { success: true, tasks: tasks || [] };
	} catch (error: unknown) {
		console.error("Get all tasks error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to fetch tasks",
			tasks: [],
		};
	}
}
