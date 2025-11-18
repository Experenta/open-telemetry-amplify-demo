"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";
import {
	trace,
	metrics,
	Span,
	SpanStatusCode,
	Counter,
} from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider"; // Asegúrate de que esta importación sea correcta

type ProjectStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";

// ============================================================================
// Métricas Personalizadas (Mantenidas y reutilizadas)
// ============================================================================

const meter = metrics.getMeter("projects-events");

const projectEventsCounter = meter.createCounter("projects.events", {
	description: "Business events in project operations",
	unit: "1",
});

const projectCreationPhaseCounter = meter.createCounter(
	"projects.creation.phase",
	{
		description: "Project creation lifecycle phases",
		unit: "1",
	}
);

const projectUpdatePhaseCounter = meter.createCounter("projects.update.phase", {
	description: "Project update lifecycle phases",
	unit: "1",
});

const projectFetchPhaseCounter = meter.createCounter("projects.fetch.phase", {
	description: "Project fetch lifecycle phases",
	unit: "1",
});

const projectProcessingTime = meter.createHistogram(
	"projects.processing.time",
	{
		description: "Time between start and completion events",
		unit: "ms",
	}
);

// ============================================================================
// Utilitarios para Atributos y Métricas Comunes
// ============================================================================

interface ProjectSpanContextData {
	projectId?: string;
	projectStatus?: ProjectStatus;
}

function getCommonAttributes(data: ProjectSpanContextData) {
	return {
		"service.name": "project-management",
		"service.module": "projects",
		"resource.type": "project",
		"resource.id": data.projectId || "unknown",
		"project.status": data.projectStatus || "unknown",
	};
}

function getActionAttributes(
	actionName: string,
	actionType: "create" | "read" | "update" | "delete"
) {
	return {
		"action.name": actionName,
		"action.type": actionType,
		"operation.type": actionType,
	};
}

// ----------------------------------------------------------------------------
// Utilidad para iniciar y registrar métricas (para operaciones con temporización)
// ----------------------------------------------------------------------------

function recordStartEvent(
	span: Span,
	operationName: string,
	context: {
		projectId?: string;
		projectStatus?: ProjectStatus;
		phaseCounter: Counter;
	}
) {
	const commonAttrs = getCommonAttributes(context);
	const actionAttrs = getActionAttributes(
		operationName,
		operationName.includes("create")
			? "create"
			: operationName.includes("read")
			? "read"
			: operationName.includes("update")
			? "update"
			: "delete"
	);

	span.setAttributes({
		...commonAttrs,
		...actionAttrs,
		"operation.phase": "started",
		"operation.status": "pending",
	});

	span.addEvent("operation.phase.started", {
		"operation.phase": "started",
		"resource.type": "project",
		"action.type": actionAttrs["action.type"],
	});

	// 📊 MÉTRICAS: Registrar evento de inicio
	context.phaseCounter.add(1, {
		phase: "started",
		operation: operationName,
		...(context.projectStatus && {
			"project.status": context.projectStatus,
		}),
	});

	projectEventsCounter.add(1, {
		"event.name": `project.${actionAttrs["action.type"]}.started`,
		operation: operationName,
		"project.id": context.projectId || "none",
	});
}

// ----------------------------------------------------------------------------
// Utilidad para completar y registrar métricas
// ----------------------------------------------------------------------------

function recordCompleteEvent(
	span: Span,
	operationName: string,
	context: {
		projectId?: string;
		projectStatus?: ProjectStatus;
		phaseCounter: Counter;
		startTime: number;
		attributes?: Record<string, string | number>;
	}
) {
	const processingTime = Date.now() - context.startTime;

	span.setAttributes({
		"operation.phase": "completed",
		"operation.status": "success",
		...context.attributes,
	});
	span.setStatus({ code: SpanStatusCode.OK });

	span.addEvent("operation.phase.completed", {
		"operation.phase": "completed",
		processing_time_ms: processingTime,
		...context.attributes,
	});

	// 📊 MÉTRICAS: Registrar evento de completado y tiempo
	context.phaseCounter.add(1, {
		phase: "completed",
		operation: operationName,
		...(context.projectStatus && {
			"project.status": context.projectStatus,
		}),
	});

	projectEventsCounter.add(1, {
		"event.name": `project.${
			operationName.includes("create")
				? "create"
				: operationName.includes("read")
				? "fetch"
				: operationName.includes("update")
				? "update"
				: "delete"
		}.completed`,
		operation: operationName,
		"project.id": context.projectId || "none",
	});

	projectProcessingTime.record(processingTime, {
		operation: operationName,
		"project.id": context.projectId || "none",
		...(context.projectStatus && {
			"project.status": context.projectStatus,
		}),
	});
}

// ----------------------------------------------------------------------------
// Utilidad para manejar y registrar errores
// ----------------------------------------------------------------------------

function recordErrorEvent(
	span: Span,
	operationName: string,
	error: unknown,
	context: {
		projectId?: string;
		projectStatus?: ProjectStatus;
		phaseCounter: Counter;
		errorType: "database" | "runtime";
	}
) {
	const errorMessage =
		error instanceof Error ? error.message : "Unknown error";
	const commonAttrs = getCommonAttributes(context);

	span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
	span.setAttributes({
		...commonAttrs,
		"operation.phase": "error",
		"operation.status": "failed",
		"error.type": context.errorType,
		"error.message": errorMessage,
	});
	span.recordException(error as Error);
	span.addEvent("operation.phase.error", {
		"error.type": context.errorType,
		"error.message": errorMessage,
	});

	// 📊 MÉTRICAS: Registrar evento de error/excepción
	context.phaseCounter.add(1, {
		phase: context.errorType === "database" ? "error" : "exception",
		operation: operationName,
		...(context.projectStatus && {
			"project.status": context.projectStatus,
		}),
	});

	projectEventsCounter.add(1, {
		"event.name": `project.${
			operationName.includes("create")
				? "create"
				: operationName.includes("read")
				? "fetch"
				: operationName.includes("update")
				? "update"
				: "delete"
		}.exception`,
		operation: operationName,
		"project.id": context.projectId || "none",
	});

	console.error(`${operationName} error:`, error);
}

// ============================================================================
// OPERACIÓN: getProjects (READ - Global)
// ============================================================================

export async function getProjects() {
	const tracer = trace.getTracer("projects-actions");

	return await tracer.startActiveSpan(
		"projects.getProjects",
		async (span) => {
			const eventStartTime = Date.now();

			try {
				recordStartEvent(span, "getProjects", {
					phaseCounter: projectFetchPhaseCounter,
				});

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
					recordErrorEvent(
						span,
						"getProjects",
						new Error(JSON.stringify(errors)),
						{
							phaseCounter: projectFetchPhaseCounter,
							errorType: "database",
						}
					);

					span.end();
					return {
						success: false,
						error: "Failed to fetch projects",
						projects: [],
					};
				}

				const projectsList = projects || [];
				const statusCounts = projectsList.reduce(
					(acc: Record<string, number>, p) => {
						const key = p.status ?? "UNKNOWN";
						acc[key] = (acc[key] || 0) + 1;
						return acc;
					},
					{} as Record<string, number>
				);

				recordCompleteEvent(span, "getProjects", {
					startTime: eventStartTime,
					phaseCounter: projectFetchPhaseCounter,
					attributes: {
						"query.result.count": projectsList.length.toString(),
						"projects.active": statusCounts["ACTIVE"] || 0,
						"projects.completed": statusCounts["COMPLETED"] || 0,
						"projects.archived": statusCounts["ARCHIVED"] || 0,
					},
				});

				span.end();
				return { success: true, projects: projectsList };
			} catch (error: unknown) {
				recordErrorEvent(span, "getProjects", error, {
					phaseCounter: projectFetchPhaseCounter,
					errorType: "runtime",
				});

				span.end();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to fetch projects",
					projects: [],
				};
			} finally {
				await meterProvider.forceFlush();
			}
		}
	);
}

// ============================================================================
// OPERACIÓN: getProjectById (READ - Individual)
// ============================================================================

export async function getProjectById(id: string) {
	const tracer = trace.getTracer("projects-actions");

	return await tracer.startActiveSpan(
		"projects.getProjectById",
		async (span) => {
			try {
				const commonAttrs = getCommonAttributes({ projectId: id });
				const actionAttrs = getActionAttributes(
					"getProjectById",
					"read"
				);

				span.setAttributes({
					...commonAttrs,
					...actionAttrs,
					"operation.phase": "started",
					"operation.status": "pending",
				});
				span.addEvent("operation.phase.started");

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
					recordErrorEvent(
						span,
						"getProjectById",
						new Error(JSON.stringify(errors)),
						{
							projectId: id,
							phaseCounter: projectFetchPhaseCounter, // Usar fetch counter para lectura
							errorType: "database",
						}
					);
					span.end();
					return {
						success: false,
						error: "Failed to fetch project",
						project: null,
					};
				}

				if (!project) {
					// Aunque no es un error de DB, es un error de negocio/no encontrado.
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: "Project not found",
					});
					span.setAttributes({
						"operation.status": "failed",
						"error.type": "not_found",
					});
					span.end();
					return {
						success: false,
						error: "Project not found",
						project: null,
					};
				}

				span.setAttributes({
					"project.status": project.status || "unknown",
					"operation.phase": "completed",
					"operation.status": "success",
				});
				span.setStatus({ code: SpanStatusCode.OK });
				span.addEvent("operation.phase.completed");

				span.end();
				return { success: true, error: "", project: project };
			} catch (error: unknown) {
				recordErrorEvent(span, "getProjectById", error, {
					projectId: id,
					phaseCounter: projectFetchPhaseCounter,
					errorType: "runtime",
				});

				span.end();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to fetch project",
					project: null,
				};
			}
		}
	);
}

// ============================================================================
// OPERACIÓN: createProject (CREATE)
// ============================================================================

export async function createProject(formData: FormData) {
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const status = (formData.get("status") as ProjectStatus) || "ACTIVE";
	const tracer = trace.getTracer("projects-actions");

	if (!name?.trim()) {
		return { success: false, error: "Project name is required" };
	}

	return await tracer.startActiveSpan(
		"projects.createProject",
		async (span) => {
			const eventStartTime = Date.now();

			try {
				recordStartEvent(span, "createProject", {
					projectStatus: status,
					phaseCounter: projectCreationPhaseCounter,
				});

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
					recordErrorEvent(
						span,
						"createProject",
						new Error(JSON.stringify(errors)),
						{
							projectStatus: status,
							phaseCounter: projectCreationPhaseCounter,
							errorType: "database",
						}
					);

					span.end();
					await meterProvider.forceFlush();
					return {
						success: false,
						error: "Failed to create project",
					};
				}

				recordCompleteEvent(span, "createProject", {
					projectId: project?.id,
					projectStatus: status,
					startTime: eventStartTime,
					phaseCounter: projectCreationPhaseCounter,
					attributes: {
						"project.name": name.trim(),
					},
				});

				span.end();
				revalidatePath("/projects");
				await meterProvider.forceFlush();
				return { success: true, project };
			} catch (error: unknown) {
				recordErrorEvent(span, "createProject", error, {
					projectStatus: status,
					phaseCounter: projectCreationPhaseCounter,
					errorType: "runtime",
				});

				span.end();
				await meterProvider.forceFlush();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to create project",
				};
			}
		}
	);
}

// ============================================================================
// OPERACIÓN: updateProject (UPDATE)
// ============================================================================

export async function updateProject(id: string, formData: FormData) {
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const status = formData.get("status") as ProjectStatus;
	const tracer = trace.getTracer("projects-actions");

	if (!name?.trim()) {
		return { success: false, error: "Project name is required" };
	}

	return await tracer.startActiveSpan(
		"projects.updateProject",
		async (span) => {
			const eventStartTime = Date.now();

			try {
				recordStartEvent(span, "updateProject", {
					projectId: id,
					projectStatus: status,
					phaseCounter: projectUpdatePhaseCounter,
				});

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
					recordErrorEvent(
						span,
						"updateProject",
						new Error(JSON.stringify(errors)),
						{
							projectId: id,
							projectStatus: status,
							phaseCounter: projectUpdatePhaseCounter,
							errorType: "database",
						}
					);

					span.end();
					return {
						success: false,
						error: "Failed to update project",
					};
				}

				recordCompleteEvent(span, "updateProject", {
					projectId: id,
					projectStatus: status,
					startTime: eventStartTime,
					phaseCounter: projectUpdatePhaseCounter,
					attributes: {
						"project.name": name.trim(),
					},
				});

				span.end();
				revalidatePath("/projects");
				revalidatePath(`/projects/${id}`);
				return { success: true, project };
			} catch (error: unknown) {
				recordErrorEvent(span, "updateProject", error, {
					projectId: id,
					projectStatus: status,
					phaseCounter: projectUpdatePhaseCounter,
					errorType: "runtime",
				});

				span.end();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to update project",
				};
			}
		}
	);
}

// ============================================================================
// OPERACIÓN: deleteProject (DELETE)
// ============================================================================

export async function deleteProject(id: string) {
	const tracer = trace.getTracer("projects-actions");

	return await tracer.startActiveSpan(
		"projects.deleteProject",
		async (span) => {
			try {
				// Aquí no tenemos el status del proyecto, solo el ID
				const commonAttrs = getCommonAttributes({ projectId: id });
				const actionAttrs = getActionAttributes(
					"deleteProject",
					"delete"
				);

				span.setAttributes({
					...commonAttrs,
					...actionAttrs,
					"operation.phase": "started",
					"operation.status": "pending",
				});
				span.addEvent("operation.phase.started");

				// Nota: Usamos projectUpdatePhaseCounter para la métrica ya que no tienes un deleteCounter específico.
				// Podrías crear uno, pero por coherencia con el update/fetch se usa uno existente si no se quiere añadir más.
				projectUpdatePhaseCounter.add(1, {
					phase: "started",
					operation: "deleteProject",
				});
				projectEventsCounter.add(1, {
					"event.name": "project.delete.started",
					operation: "deleteProject",
					"project.id": id,
				});
				const eventStartTime = Date.now();

				const { errors } =
					await cookieBasedClient.models.Project.delete({ id });

				if (errors) {
					recordErrorEvent(
						span,
						"deleteProject",
						new Error(JSON.stringify(errors)),
						{
							projectId: id,
							phaseCounter: projectUpdatePhaseCounter, // Usamos el update/write counter
							errorType: "database",
						}
					);

					span.end();
					return {
						success: false,
						error: "Failed to delete project",
					};
				}

				recordCompleteEvent(span, "deleteProject", {
					projectId: id,
					startTime: eventStartTime,
					phaseCounter: projectUpdatePhaseCounter,
					attributes: {
						// Atributos de finalización
						"project.deleted.id": id,
					},
				});

				span.end();
				revalidatePath("/projects");
				return { success: true };
			} catch (error: unknown) {
				recordErrorEvent(span, "deleteProject", error, {
					projectId: id,
					phaseCounter: projectUpdatePhaseCounter,
					errorType: "runtime",
				});

				span.end();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to delete project",
				};
			}
		}
	);
}
