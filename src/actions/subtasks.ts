"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";
import { trace } from "@opentelemetry/api";

export async function getSubtasksByTaskId(taskId: string) {
	try {
		const { data: subtasks, errors } =
			await cookieBasedClient.models.Subtask.list({
				filter: { taskId: { eq: taskId } },
				selectionSet: [
					"id",
					"title",
					"isCompleted",
					"createdAt",
					"updatedAt",
					"taskId",
				],
			});

		if (errors) {
			console.error("Get subtasks errors:", errors);
			return {
				success: false,
				error: "Failed to fetch subtasks",
				subtasks: [],
			};
		}

		return { success: true, subtasks: subtasks || [] };
	} catch (error: unknown) {
		console.error("Get subtasks error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to fetch subtasks",
			subtasks: [],
		};
	}
}

export async function createSubtask(formData: FormData) {
	const taskId = formData.get("taskId") as string;
	const title = formData.get("title") as string;

	if (!title?.trim()) {
		return { success: false, error: "Subtask title is required" };
	}

	if (!taskId) {
		return { success: false, error: "Task ID is required" };
	}

	try {
		const { data: subtask, errors } =
			await cookieBasedClient.models.Subtask.create(
				{
					taskId,
					title: title.trim(),
					isCompleted: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					selectionSet: [
						"id",
						"title",
						"isCompleted",
						"createdAt",
						"updatedAt",
						"taskId",
					],
				}
			);

		if (errors) {
			console.error("Create subtask errors:", errors);
			return { success: false, error: "Failed to create subtask" };
		}

		// Revalidate the project page that contains this task
		const projectId = formData.get("projectId") as string;
		if (projectId) {
			revalidatePath(`/projects/${projectId}`);
		}

		return { success: true, subtask };
	} catch (error: unknown) {
		console.error("Create subtask error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to create subtask",
		};
	}
}

export async function updateSubtask(id: string, formData: FormData) {
	const title = formData.get("title") as string;
	const isCompleted = formData.get("isCompleted") === "true";
	const projectId = formData.get("projectId") as string;

	try {
		const { data: subtask, errors } =
			await cookieBasedClient.models.Subtask.update(
				{
					id,
					title: title.trim(),
					isCompleted,
					updatedAt: new Date().toISOString(),
				},
				{
					selectionSet: [
						"id",
						"title",
						"isCompleted",
						"createdAt",
						"updatedAt",
						"taskId",
					],
				}
			);

		if (errors) {
			console.error("Update subtask errors:", errors);
			return { success: false, error: "Failed to update subtask" };
		}

		if (projectId) {
			revalidatePath(`/projects/${projectId}`);
		}

		return { success: true, subtask };
	} catch (error: unknown) {
		console.error("Update subtask error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to update subtask",
		};
	}
}

export async function toggleSubtask(
	id: string,
	isCompleted: boolean,
	projectId?: string
) {
	try {
		const { data: subtask, errors } =
			await cookieBasedClient.models.Subtask.update(
				{
					id,
					isCompleted,
					updatedAt: new Date().toISOString(),
				},
				{
					selectionSet: [
						"id",
						"title",
						"isCompleted",
						"createdAt",
						"updatedAt",
						"taskId",
					],
				}
			);

		if (errors) {
			console.error("Toggle subtask errors:", errors);
			return { success: false, error: "Failed to toggle subtask" };
		}

		if (projectId) {
			revalidatePath(`/projects/${projectId}`);
		}

		return { success: true, subtask };
	} catch (error: unknown) {
		console.error("Toggle subtask error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to toggle subtask",
		};
	}
}

export async function deleteSubtask(id: string, projectId?: string) {
	try {
		const { errors } = await cookieBasedClient.models.Subtask.delete({
			id,
		});

		if (errors) {
			console.error("Delete subtask errors:", errors);
			return { success: false, error: "Failed to delete subtask" };
		}

		if (projectId) {
			revalidatePath(`/projects/${projectId}`);
		}

		return { success: true };
	} catch (error: unknown) {
		console.error("Delete subtask error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to delete subtask",
		};
	}
}

export async function getAllSubtasks() {
	const tracer = trace.getTracer("subtasks-actions");
	
	return await tracer.startActiveSpan("subtasks.getAllSubtasks", async (span) => {
		try {
			span.setAttribute("action.name", "getAllSubtasks");
			span.setAttribute("action.type", "read");
			span.setAttribute("resource.type", "subtask");
			span.addEvent("subtasks.fetch.started");

			const { data: subtasks, errors } =
				await cookieBasedClient.models.Subtask.list({
					selectionSet: [
						"id",
						"title",
						"isCompleted",
						"createdAt",
						"updatedAt",
						"taskId",
					],
				});

			if (errors) {
				span.setStatus({
					code: 2, // ERROR
					message: "Failed to fetch subtasks",
				});
				span.recordException(new Error(JSON.stringify(errors)));
				span.addEvent("subtasks.fetch.errors", {
					errorCount: errors.length.toString(),
				});
				console.error("Get all subtasks errors:", errors);
				
				span.end();
				return {
					success: false,
					error: "Failed to fetch subtasks",
					subtasks: [],
				};
			}

			const subtasksList = subtasks || [];
			span.setAttribute("subtasks.count", subtasksList.length);
			
			// Calculate completion breakdown
			const completedCount = subtasksList.filter((s) => s.isCompleted).length;
			const pendingCount = subtasksList.length - completedCount;

			span.setAttribute("subtasks.completed", completedCount);
			span.setAttribute("subtasks.pending", pendingCount);
			
			const completionRate = subtasksList.length > 0 
				? (completedCount / subtasksList.length) * 100 
				: 0;
			span.setAttribute("subtasks.completion_rate", completionRate);

			span.addEvent("subtasks.fetch.completed", {
				subtasksCount: subtasksList.length.toString(),
				completedCount: completedCount.toString(),
				completionRate: completionRate.toFixed(2),
			});
			span.setStatus({ code: 1 }); // OK

			span.end();
			return { success: true, subtasks: subtasksList };
		} catch (error: unknown) {
			span.setStatus({
				code: 2, // ERROR
				message: error instanceof Error ? error.message : "Unknown error",
			});
			span.recordException(error as Error);
			span.addEvent("subtasks.fetch.error", {
				error: error instanceof Error ? error.message : "Unknown error",
			});
			console.error("Get all subtasks error:", error);
			
			span.end();
			return {
				success: false,
				error: (error as Error).message || "Failed to fetch subtasks",
				subtasks: [],
			};
		}
	});
}
