"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";
import { trace } from "@opentelemetry/api";

type ProjectStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";

export async function getProjects() {
	const tracer = trace.getTracer("projects-actions");

	return await tracer.startActiveSpan(
		"projects.getProjects",
		async (span) => {
			try {
				span.setAttribute("action.name", "getProjects");
				span.setAttribute("action.type", "read");
				span.setAttribute("resource.type", "project");
				span.addEvent("projects.fetch.started");

				const { data: projects, errors } =
					await cookieBasedClient.models.Project.list({
						selectionSet: [
							"id",
							"name",
							"description",
							"status",
							"createdAt",
							"updatedAt",
						],
					});

				if (errors) {
					span.setStatus({
						code: 2, // ERROR
						message: "Failed to fetch projects",
					});
					span.recordException(new Error(JSON.stringify(errors)));
					span.addEvent("projects.fetch.errors", {
						errorCount: errors.length.toString(),
					});
					console.error("Get projects errors:", errors);

					span.end();
					return {
						success: false,
						error: "Failed to fetch projects",
						projects: [],
					};
				}

				const projectsList = projects || [];
				span.setAttribute("projects.count", projectsList.length);

				// Calculate status breakdown
				const statusCounts = projectsList.reduce((acc, p) => {
					acc[p.status] = (acc[p.status] || 0) + 1;
					return acc;
				}, {} as Record<string, number>);

				span.setAttribute("projects.active", statusCounts.ACTIVE || 0);
				span.setAttribute(
					"projects.completed",
					statusCounts.COMPLETED || 0
				);
				span.setAttribute(
					"projects.archived",
					statusCounts.ARCHIVED || 0
				);

				span.addEvent("projects.fetch.completed", {
					projectsCount: projectsList.length.toString(),
					activeCount: (statusCounts.ACTIVE || 0).toString(),
				});
				span.setStatus({ code: 1 }); // OK

				span.end();
				return { success: true, projects: projectsList };
			} catch (error: unknown) {
				span.setStatus({
					code: 2, // ERROR
					message:
						error instanceof Error
							? error.message
							: "Unknown error",
				});
				span.recordException(error as Error);
				span.addEvent("projects.fetch.error", {
					error:
						error instanceof Error
							? error.message
							: "Unknown error",
				});
				console.error("Get projects error:", error);

				span.end();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to fetch projects",
					projects: [],
				};
			}
		}
	);
}

export async function getProjectById(id: string) {
	try {
		const { data: project, errors } =
			await cookieBasedClient.models.Project.get(
				{ id },
				{
					selectionSet: [
						"id",
						"name",
						"description",
						"status",
						"createdAt",
						"updatedAt",
					],
				}
			);

		if (errors) {
			console.error("Get project errors:", errors);
			return {
				success: false,
				error: "Failed to fetch project",
				project: null,
			};
		}

		return { success: true, project };
	} catch (error: unknown) {
		console.error("Get project error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to fetch project",
			project: null,
		};
	}
}

export async function createProject(formData: FormData) {
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const status = (formData.get("status") as ProjectStatus) || "ACTIVE";

	if (!name?.trim()) {
		return { success: false, error: "Project name is required" };
	}

	try {
		const { data: project, errors } =
			await cookieBasedClient.models.Project.create(
				{
					name: name.trim(),
					description: description?.trim() || null,
					status,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					selectionSet: [
						"id",
						"name",
						"description",
						"status",
						"createdAt",
						"updatedAt",
					],
				}
			);

		if (errors) {
			console.error("Create project errors:", errors);
			return { success: false, error: "Failed to create project" };
		}

		revalidatePath("/projects");
		return { success: true, project };
	} catch (error: unknown) {
		console.error("Create project error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to create project",
		};
	}
}

export async function updateProject(id: string, formData: FormData) {
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const status = formData.get("status") as ProjectStatus;

	if (!name?.trim()) {
		return { success: false, error: "Project name is required" };
	}

	try {
		const { data: project, errors } =
			await cookieBasedClient.models.Project.update(
				{
					id,
					name: name.trim(),
					description: description?.trim() || null,
					status,
					updatedAt: new Date().toISOString(),
				},
				{
					selectionSet: [
						"id",
						"name",
						"description",
						"status",
						"createdAt",
						"updatedAt",
					],
				}
			);

		if (errors) {
			console.error("Update project errors:", errors);
			return { success: false, error: "Failed to update project" };
		}

		revalidatePath("/projects");
		revalidatePath(`/projects/${id}`);
		return { success: true, project };
	} catch (error: unknown) {
		console.error("Update project error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to update project",
		};
	}
}

export async function deleteProject(id: string) {
	try {
		const { errors } = await cookieBasedClient.models.Project.delete({
			id,
		});

		if (errors) {
			console.error("Delete project errors:", errors);
			return { success: false, error: "Failed to delete project" };
		}

		revalidatePath("/projects");
		return { success: true };
	} catch (error: unknown) {
		console.error("Delete project error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to delete project",
		};
	}
}
