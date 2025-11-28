"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";
import { trace, metrics, Span, SpanStatusCode } from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { flushTraces } from "@/lib/otel-utils";

/**
 * Tipos de datos para proyectos
 */
type ProjectStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";

/**
 * Inicialización de métricas personalizadas
 */
const meter = metrics.getMeter("projects-events");

/**
 * Contador único para eventos completados/errores de proyectos (solo CRUD, no lectura)
 */
const projectEventsCounter = meter.createCounter("projects.events", {
	description:
		"Business events in project operations (created, updated, deleted, errors)",
	unit: "1",
});

/**
 * Histogramas de latencia por tipo de operación
 */
const createProjectLatency = meter.createHistogram("projects.create.latency", {
	description: "Latency of create project operations",
	unit: "ms",
});

const updateProjectLatency = meter.createHistogram("projects.update.latency", {
	description: "Latency of update project operations",
	unit: "ms",
});

const fetchProjectsLatency = meter.createHistogram("projects.fetch.latency", {
	description: "Latency of fetch project operations",
	unit: "ms",
});

const deleteProjectLatency = meter.createHistogram("projects.delete.latency", {
	description: "Latency of delete project operations",
	unit: "ms",
});

/**
 * Histograma general de tiempo de procesamiento
 */
const projectProcessingTime = meter.createHistogram(
	"projects.processing.time",
	{
		description: "Time between start and completion events",
		unit: "ms",
	}
);

/**
 * Logger centralizado para eventos
 */
const logger = logs.getLogger("projects-actions", "1.0.0");

/**
 * Registra eventos en logs con nivel de severidad especificado
 */
function logIssue(
	severity: SeverityNumber,
	severityText: string,
	body: string,
	attributes: Record<string, any>
) {
	logger.emit({
		severityNumber: severity,
		severityText: severityText,
		body: body,
		attributes: attributes,
	});
}

/**
 * Interfaz para contexto de datos en spans
 */
interface ProjectSpanContextData {
	projectId?: string;
	projectStatus?: ProjectStatus;
}

/**
 * Obtiene atributos comunes para todos los spans de proyectos
 */
function getCommonAttributes(data: ProjectSpanContextData) {
	return {
		"service.name": "project-management",
		"service.module": "projects",
		"resource.type": "project",
		"resource.id": data.projectId || "unknown",
		"project.status": data.projectStatus || "unknown",
	};
}

/**
 * Obtiene atributos específicos de la acción realizada
 */
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

/**
 * Registra el inicio de una operación en el span
 */
function recordStartEvent(
	span: Span,
	operationName: string,
	context: { projectId?: string; projectStatus?: ProjectStatus }
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
}

/**
 * Registra la finalización exitosa de una operación de escritura (CREATE, UPDATE, DELETE)
 * Incrementa el contador de eventos una única vez por operación completada
 * NO se usa para operaciones READ
 */
function recordCompleteEvent(
	span: Span,
	operationName: string,
	context: {
		projectId?: string;
		projectStatus?: ProjectStatus;
		startTime: number;
		attributes?: Record<string, any>;
	}
) {
	const processingTime = Date.now() - context.startTime;
	const actionType = operationName.includes("create")
		? "create"
		: operationName.includes("update")
		? "update"
		: "delete";

	span.setAttributes({
		"operation.phase": "completed",
		"operation.status": "success",
		processing_time_ms: processingTime,
		...context.attributes,
	});
	span.setStatus({ code: SpanStatusCode.OK });

	span.addEvent("operation.phase.completed", {
		"operation.phase": "completed",
		processing_time_ms: processingTime,
		...context.attributes,
	});

	/**
	 * Registro único del evento completado en el contador
	 * Solo para operaciones de escritura (CREATE, UPDATE, DELETE)
	 */
	projectEventsCounter.add(1, {
		"event.name": `project.${actionType}.completed`,
		"event.phase": "completed",
		operation: operationName,
		"action.type": actionType,
		"project.id": context.projectId || "none",
		processing_time_ms: processingTime.toString(),
		...(context.projectStatus && {
			"project.status": context.projectStatus,
		}),
	});

	projectProcessingTime.record(processingTime, {
		operation: operationName,
		"project.id": context.projectId || "none",
		...(context.projectStatus && {
			"project.status": context.projectStatus,
		}),
	});

	if (operationName === "createProject") {
		createProjectLatency.record(processingTime, {
			"project.status": context.projectStatus || "unknown",
		});
	} else if (operationName === "updateProject") {
		updateProjectLatency.record(processingTime, {
			"project.status": context.projectStatus || "unknown",
		});
	} else if (operationName === "deleteProject") {
		deleteProjectLatency.record(processingTime, {
			"project.id": context.projectId || "none",
		});
	}
}

/**
 * Registra latencia de operaciones de lectura (READ)
 * Sin incrementar el contador de eventos de negocio
 */
function recordReadLatency(
	span: Span,
	operationName: string,
	context: {
		projectId?: string;
		projectStatus?: ProjectStatus;
		startTime: number;
		attributes?: Record<string, any>;
	}
) {
	const processingTime = Date.now() - context.startTime;

	span.setAttributes({
		"operation.phase": "completed",
		"operation.status": "success",
		processing_time_ms: processingTime,
		...context.attributes,
	});
	span.setStatus({ code: SpanStatusCode.OK });

	span.addEvent("operation.phase.completed", {
		"operation.phase": "completed",
		processing_time_ms: processingTime,
		...context.attributes,
	});

	/**
	 * Registra latencia SIN incrementar el contador de eventos
	 * Las operaciones READ no son "eventos de negocio", solo observabilidad
	 */
	projectProcessingTime.record(processingTime, {
		operation: operationName,
		"project.id": context.projectId || "none",
		...(context.projectStatus && {
			"project.status": context.projectStatus,
		}),
	});

	fetchProjectsLatency.record(processingTime, {
		operation: operationName,
		"project.id": context.projectId || "none",
	});
}

/**
 * Registra errores en operaciones de escritura
 * Incrementa el contador de eventos una única vez por operación fallida
 */
function recordErrorEvent(
	span: Span,
	operationName: string,
	error: unknown,
	context: {
		projectId?: string;
		projectStatus?: ProjectStatus;
		errorType: "database" | "runtime";
	}
) {
	const errorMessage =
		error instanceof Error ? error.message : "Unknown error";
	const commonAttrs = getCommonAttributes(context);
	const actionType = operationName.includes("create")
		? "create"
		: operationName.includes("update")
		? "update"
		: "delete";

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

	/**
	 * Registro único del evento de error en el contador
	 * Solo para operaciones de escritura
	 */
	projectEventsCounter.add(1, {
		"event.name": `project.${actionType}.exception`,
		"event.phase": "error",
		operation: operationName,
		"action.type": actionType,
		"project.id": context.projectId || "none",
		"error.type": context.errorType,
		"error.message": errorMessage,
		...(context.projectStatus && {
			"project.status": context.projectStatus,
		}),
	});

	logIssue(SeverityNumber.ERROR, "ERROR", `${operationName} failed`, {
		"error.message": errorMessage,
		"error.type": context.errorType,
		"project.id": context.projectId,
	});

	console.error(`${operationName} error:`, error);
}

/**
 * Obtiene todos los proyectos del sistema (READ - No incrementa contador)
 */
export async function getProjects() {
	const tracer = trace.getTracer("projects-actions");

	return await tracer.startActiveSpan(
		"projects.getProjects",
		async (span) => {
			const eventStartTime = Date.now();

			try {
				recordStartEvent(span, "getProjects", {});

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
						code: SpanStatusCode.ERROR,
						message: "Database error",
					});
					span.setAttributes({
						"operation.phase": "error",
						"operation.status": "failed",
						"error.type": "database",
					});
					span.recordException(new Error(JSON.stringify(errors)));

					span.end();
					await meterProvider.forceFlush();
					await flushTraces();
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

				recordReadLatency(span, "getProjects", {
					startTime: eventStartTime,
					attributes: {
						"query.result.count": projectsList.length.toString(),
						"projects.active": (
							statusCounts["ACTIVE"] || 0
						).toString(),
						"projects.completed": (
							statusCounts["COMPLETED"] || 0
						).toString(),
						"projects.archived": (
							statusCounts["ARCHIVED"] || 0
						).toString(),
					},
				});

				span.end();
				await meterProvider.forceFlush();
				await flushTraces();
				return { success: true, projects: projectsList };
			} catch (error: unknown) {
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: (error as Error).message,
				});
				span.setAttributes({
					"operation.phase": "error",
					"operation.status": "failed",
					"error.type": "runtime",
				});
				span.recordException(error as Error);

				span.end();
				await meterProvider.forceFlush();
				await flushTraces();
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

/**
 * Obtiene un proyecto específico por su ID (READ - No incrementa contador)
 */
export async function getProjectById(id: string) {
	const tracer = trace.getTracer("projects-actions");

	return await tracer.startActiveSpan(
		"projects.getProjectById",
		async (span) => {
			const eventStartTime = Date.now();

			try {
				recordStartEvent(span, "getProjectById", {
					projectId: id,
				});

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
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: "Database error",
					});
					span.setAttributes({
						"operation.phase": "error",
						"operation.status": "failed",
						"error.type": "database",
					});
					span.recordException(new Error(JSON.stringify(errors)));

					span.end();
					await meterProvider.forceFlush();
					await flushTraces();
					return {
						success: false,
						error: "Failed to fetch project",
						project: null,
					};
				}

				if (!project) {
					span.setStatus({
						code: SpanStatusCode.ERROR,
						message: "Project not found",
					});
					span.setAttributes({
						"operation.status": "failed",
						"error.type": "not_found",
					});
					span.end();
					await meterProvider.forceFlush();
					await flushTraces();
					return {
						success: false,
						error: "Project not found",
						project: null,
					};
				}

				recordReadLatency(span, "getProjectById", {
					projectId: id,
					projectStatus: project.status as ProjectStatus,
					startTime: eventStartTime,
					attributes: {
						"project.status": project.status,
					},
				});

				span.end();
				await meterProvider.forceFlush();
				await flushTraces();
				return { success: true, project };
			} catch (error: unknown) {
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: (error as Error).message,
				});
				span.setAttributes({
					"operation.phase": "error",
					"operation.status": "failed",
					"error.type": "runtime",
				});
				span.recordException(error as Error);

				span.end();
				await meterProvider.forceFlush();
				await flushTraces();
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

/**
 * Crea un nuevo proyecto (CREATE - Incrementa contador)
 */
export async function createProject(formData: FormData) {
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const status = (formData.get("status") as ProjectStatus) || "ACTIVE";

	const tracer = trace.getTracer("projects-actions");

	if (!name?.trim()) {
		logIssue(
			SeverityNumber.WARN,
			"WARN",
			"Project name validation failed",
			{
				"validation.field": "name",
				"validation.error": "Project name is required",
			}
		);
		return { success: false, error: "Project name is required" };
	}

	logIssue(SeverityNumber.INFO, "INFO", "Starting project creation", {
		"project.name": name.trim(),
		"project.status": status,
	});

	return await tracer.startActiveSpan(
		"projects.createProject",
		async (span) => {
			const eventStartTime = Date.now();

			try {
				recordStartEvent(span, "createProject", {
					projectStatus: status,
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
							errorType: "database",
						}
					);

					span.end();
					await meterProvider.forceFlush();
					await flushTraces();
					return {
						success: false,
						error: "Failed to create project",
					};
				}

				recordCompleteEvent(span, "createProject", {
					projectId: project?.id,
					projectStatus: status,
					startTime: eventStartTime,
					attributes: {
						"project.name": name.trim(),
					},
				});

				logIssue(
					SeverityNumber.INFO,
					"INFO",
					"Project created successfully",
					{
						"project.id": project?.id || "unknown",
						"project.name": name.trim(),
						"project.status": status,
					}
				);

				span.end();
				revalidatePath("/projects");
				await meterProvider.forceFlush();
				await flushTraces();
				const tracerProvider = trace.getTracerProvider();
				tracerProvider.getTracer("projects-actions");
				return { success: true, project };
			} catch (error: unknown) {
				recordErrorEvent(span, "createProject", error, {
					projectStatus: status,
					errorType: "runtime",
				});

				span.end();
				await meterProvider.forceFlush();
				await flushTraces();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to create project",
				};
			}
		}
	);
}

/**
 * Actualiza un proyecto existente (UPDATE - Incrementa contador)
 */
export async function updateProject(id: string, formData: FormData) {
	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const status = formData.get("status") as ProjectStatus;

	const tracer = trace.getTracer("projects-actions");

	if (!name?.trim()) {
		logIssue(
			SeverityNumber.WARN,
			"WARN",
			"Project name validation failed",
			{
				"validation.field": "name",
				"validation.error": "Project name is required",
				"project.id": id,
			}
		);
		return { success: false, error: "Project name is required" };
	}

	logIssue(SeverityNumber.INFO, "INFO", "Starting project update", {
		"project.id": id,
		"project.name": name.trim(),
		"project.status": status,
	});

	return await tracer.startActiveSpan(
		"projects.updateProject",
		async (span) => {
			const eventStartTime = Date.now();

			try {
				recordStartEvent(span, "updateProject", {
					projectId: id,
					projectStatus: status,
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
							errorType: "database",
						}
					);

					span.end();
					await meterProvider.forceFlush();
					await flushTraces();
					return {
						success: false,
						error: "Failed to update project",
					};
				}

				recordCompleteEvent(span, "updateProject", {
					projectId: id,
					projectStatus: status,
					startTime: eventStartTime,
					attributes: {
						"project.name": name.trim(),
					},
				});

				logIssue(
					SeverityNumber.INFO,
					"INFO",
					"Project updated successfully",
					{
						"project.id": id,
						"project.name": name.trim(),
						"project.status": status,
					}
				);

				span.end();
				revalidatePath("/projects");
				revalidatePath(`/projects/${id}`);
				await meterProvider.forceFlush();
				await flushTraces();
				return { success: true, project };
			} catch (error: unknown) {
				recordErrorEvent(span, "updateProject", error, {
					projectId: id,
					projectStatus: status,
					errorType: "runtime",
				});

				span.end();
				await meterProvider.forceFlush();
				await flushTraces();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to update project",
				};
			}
		}
	);
}

/**
 * Elimina un proyecto existente (DELETE - Incrementa contador)
 */
export async function deleteProject(id: string) {
	const tracer = trace.getTracer("projects-actions");

	return await tracer.startActiveSpan(
		"projects.deleteProject",
		async (span) => {
			const eventStartTime = Date.now();

			try {
				recordStartEvent(span, "deleteProject", {
					projectId: id,
				});

				const { errors } =
					await cookieBasedClient.models.Project.delete({ id });

				if (errors) {
					recordErrorEvent(
						span,
						"deleteProject",
						new Error(JSON.stringify(errors)),
						{
							projectId: id,
							errorType: "database",
						}
					);

					span.end();
					await meterProvider.forceFlush();
					await flushTraces();
					return {
						success: false,
						error: "Failed to delete project",
					};
				}

				recordCompleteEvent(span, "deleteProject", {
					projectId: id,
					startTime: eventStartTime,
					attributes: {
						"project.deleted.id": id,
					},
				});

				span.end();
				revalidatePath("/projects");
				await meterProvider.forceFlush();
				await flushTraces();
				return { success: true };
			} catch (error: unknown) {
				recordErrorEvent(span, "deleteProject", error, {
					projectId: id,
					errorType: "runtime",
				});

				span.end();
				await meterProvider.forceFlush();
				await flushTraces();
				return {
					success: false,
					error:
						(error as Error).message || "Failed to delete project",
				};
			}
		}
	);
}
