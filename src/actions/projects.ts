"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";

type ProjectStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";

export async function getProjects() {
	try {
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
			console.error("Get projects errors:", errors);
			return {
				success: false,
				error: "Failed to fetch projects",
				projects: [],
			};
		}

		return { success: true, projects: projects || [] };
	} catch (error: unknown) {
		console.error("Get projects error:", error);
		return {
			success: false,
			error: (error as Error).message || "Failed to fetch projects",
			projects: [],
		};
	}
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
