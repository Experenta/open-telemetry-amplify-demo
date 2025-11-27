"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";
import { trace, metrics, Span, SpanStatusCode } from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

/**
 * Tipos de datos para tareas
 */
type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

const TASK_SELECTION_SET = [
    "id",
    "title",
    "description",
    "status",
    "priority",
    "dueDate",
    "createdAt",
    "updatedAt",
    "projectId",
] as const;

/**
 * Inicialización de métricas personalizadas
 */
const meter = metrics.getMeter("tasks-events");

/**
 * Contador único para eventos completados/errores de tareas
 */
const taskEventsCounter = meter.createCounter("tasks.events", {
    description: "Business events in task operations (completed, error)",
    unit: "1",
});

/**
 * Histogramas de latencia por tipo de operación
 */
const createTaskLatency = meter.createHistogram("tasks.create.latency", {
    description: "Latency of create task operations",
    unit: "ms",
});

const updateTaskLatency = meter.createHistogram("tasks.update.latency", {
    description: "Latency of update task operations",
    unit: "ms",
});

const fetchTasksLatency = meter.createHistogram("tasks.fetch.latency", {
    description: "Latency of fetch task operations",
    unit: "ms",
});

const deleteTaskLatency = meter.createHistogram("tasks.delete.latency", {
    description: "Latency of delete task operations",
    unit: "ms",
});

/**
 * Histograma general de tiempo de procesamiento
 */
const taskProcessingTime = meter.createHistogram("tasks.processing.time", {
    description: "Time between start and completion events",
    unit: "ms",
});

/**
 * Logger centralizado para eventos
 */
const logger = logs.getLogger("tasks-actions", "1.0.0");

/**
 * Registra eventos en logs con nivel de severidad especificado
 */
function logIssue(
    severity: SeverityNumber,
    severityText: string,
    body: string,
    attributes: Record<string, any>,
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
interface TaskSpanContextData {
    projectId?: string;
    taskId?: string;
    taskStatus?: TaskStatus;
    taskPriority?: TaskPriority;
}

/**
 * Obtiene atributos comunes para todos los spans de tareas
 */
function getCommonAttributes(data: TaskSpanContextData) {
    return {
        "service.name": "project-management",
        "service.module": "tasks",
        "resource.type": "task",
        "resource.id": data.taskId || "unknown",
        "resource.parent.type": "project",
        "resource.parent.id": data.projectId || "unknown",
        "task.status": data.taskStatus || "unknown",
        "task.priority": data.taskPriority || "unknown",
    };
}

/**
 * Obtiene atributos específicos de la acción realizada
 */
function getActionAttributes(actionName: string, actionType: "create" | "read" | "update" | "delete") {
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
    context: { projectId?: string; taskId?: string; taskStatus?: TaskStatus; taskPriority?: TaskPriority; }
) {
    const commonAttrs = getCommonAttributes(context);
    const actionAttrs = getActionAttributes(
        operationName,
        operationName.includes("create") ? "create" : operationName.includes("read") ? "read" : operationName.includes("update") ? "update" : "delete"
    );

    span.setAttributes({
        ...commonAttrs,
        ...actionAttrs,
        "operation.phase": "started",
        "operation.status": "pending",
    });

    span.addEvent("operation.phase.started", {
        "operation.phase": "started",
        "resource.type": "task",
        "action.type": actionAttrs["action.type"],
    });
}

/**
 * Registra la finalización exitosa de una operación
 * Incrementa el contador de eventos una única vez por operación completada
 */
function recordCompleteEvent(
    span: Span,
    operationName: string,
    context: { projectId?: string; taskId?: string; taskStatus?: TaskStatus; taskPriority?: TaskPriority; startTime: number; attributes?: Record<string, any> }
) {
    const processingTime = Date.now() - context.startTime;
    const actionType = operationName.includes("create") ? "create" 
        : operationName.includes("read") ? "fetch" 
        : operationName.includes("update") ? "update" 
        : "delete";

    span.setAttributes({
        "operation.phase": "completed",
        "operation.status": "success",
        "processing_time_ms": processingTime,
        ...context.attributes,
    });
    span.setStatus({ code: SpanStatusCode.OK });

    span.addEvent("operation.phase.completed", {
        "operation.phase": "completed",
        "processing_time_ms": processingTime,
        ...context.attributes,
    });

    /**
     * Registro único del evento completado en el contador
     */
    taskEventsCounter.add(1, {
        "event.name": `task.${actionType}.completed`,
        "event.phase": "completed",
        "operation": operationName,
        "action.type": actionType,
        "task.id": context.taskId || "none",
        "project.id": context.projectId || "none",
        "processing_time_ms": processingTime.toString(),
        ...(context.taskStatus && { "task.status": context.taskStatus }),
        ...(context.taskPriority && { "task.priority": context.taskPriority }),
    });

    taskProcessingTime.record(processingTime, {
        "operation": operationName,
        "task.id": context.taskId || "none",
        "project.id": context.projectId || "none",
        ...(context.taskStatus && { "task.status": context.taskStatus }),
    });

    if (operationName === "createTask") {
        createTaskLatency.record(processingTime, {
            "project.id": context.projectId || "none",
            "task.priority": context.taskPriority || "unknown",
        });
    } else if (operationName === "updateTask") {
        updateTaskLatency.record(processingTime, {
            "project.id": context.projectId || "none",
            "task.status": context.taskStatus || "unknown",
        });
    } else if (operationName === "deleteTask") {
        deleteTaskLatency.record(processingTime, {
            "project.id": context.projectId || "none",
        });
    } else if (
        operationName === "getTasksByProjectId" ||
        operationName === "getTaskById" ||
        operationName === "getAllTasks"
    ) {
        fetchTasksLatency.record(processingTime, {
            "operation": operationName,
            "project.id": context.projectId || "none",
        });
    }
}

/**
 * Registra errores en operaciones
 * Incrementa el contador de eventos una única vez por operación fallida
 */
function recordErrorEvent(
    span: Span,
    operationName: string,
    error: unknown,
    context: { projectId?: string; taskId?: string; taskStatus?: TaskStatus; taskPriority?: TaskPriority; errorType: "database" | "runtime" }
) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const commonAttrs = getCommonAttributes(context);
    const actionType = operationName.includes("create") ? "create" 
        : operationName.includes("read") ? "fetch" 
        : operationName.includes("update") ? "update" 
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
     */
    taskEventsCounter.add(1, {
        "event.name": `task.${actionType}.exception`,
        "event.phase": "error",
        "operation": operationName,
        "action.type": actionType,
        "task.id": context.taskId || "none",
        "project.id": context.projectId || "none",
        "error.type": context.errorType,
        "error.message": errorMessage,
        ...(context.taskStatus && { "task.status": context.taskStatus }),
        ...(context.taskPriority && { "task.priority": context.taskPriority }),
    });

    logIssue(SeverityNumber.ERROR, "ERROR", `${operationName} failed`, {
        "error.message": errorMessage,
        "error.type": context.errorType,
        "task.id": context.taskId,
        "project.id": context.projectId,
    });

    console.error(`${operationName} error:`, error);
}

/**
 * Obtiene todas las tareas de un proyecto específico
 */
export async function getTasksByProjectId(projectId: string) {
    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.getTasksByProjectId",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "getTasksByProjectId", {
                    projectId,
                });

                const { data: tasks, errors } =
                    await cookieBasedClient.models.Task.list({
                        filter: { projectId: { eq: projectId } },
                        selectionSet: TASK_SELECTION_SET,
                    });

                if (errors) {
                    recordErrorEvent(span, "getTasksByProjectId", new Error(JSON.stringify(errors)), {
                        projectId,
                        errorType: "database",
                    });

                    span.end();
                    await meterProvider.forceFlush();
                    return {
                        success: false,
                        error: "Failed to fetch tasks",
                        tasks: [],
                    };
                }

                const tasksList = tasks || [];
                const statusCounts = tasksList.reduce((acc: any, t: any) => {
                    const key = t.status ?? "UNKNOWN";
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

                const priorityCounts = tasksList.reduce((acc: any, t: any) => {
                    const key = t.priority ?? "UNKNOWN";
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

                recordCompleteEvent(span, "getTasksByProjectId", {
                    projectId,
                    startTime: eventStartTime,
                    attributes: {
                        "query.result.count": tasksList.length.toString(),
                        "tasks.todo": statusCounts.TODO || 0,
                        "tasks.in_progress": statusCounts.IN_PROGRESS || 0,
                        "tasks.completed": statusCounts.COMPLETED || 0,
                        "tasks.priority.low": priorityCounts.LOW || 0,
                        "tasks.priority.medium": priorityCounts.MEDIUM || 0,
                        "tasks.priority.high": priorityCounts.HIGH || 0,
                    },
                });

                span.end();
                await meterProvider.forceFlush();
                return { success: true, tasks: tasksList };
            } catch (error: unknown) {
                recordErrorEvent(span, "getTasksByProjectId", error, {
                    projectId,
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to fetch tasks",
                    tasks: [],
                };
            }
        }
    );
}

/**
 * Obtiene una tarea específica por su ID
 */
export async function getTaskById(id: string) {
    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.getTaskById",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "getTaskById", {
                    taskId: id,
                });

                const { data: task, errors } =
                    await cookieBasedClient.models.Task.get(
                        { id },
                        { selectionSet: TASK_SELECTION_SET }
                    );

                if (errors) {
                    recordErrorEvent(span, "getTaskById", new Error(JSON.stringify(errors)), {
                        taskId: id,
                        errorType: "database",
                    });
                    span.end();
                    await meterProvider.forceFlush();
                    return { success: false, error: "Failed to fetch task", task: null };
                }

                if (!task) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: "Task not found" });
                    span.setAttributes({
                        "operation.status": "failed",
                        "error.type": "not_found",
                    });
                    span.end();
                    await meterProvider.forceFlush();
                    return { success: false, error: "Task not found", task: null };
                }

                recordCompleteEvent(span, "getTaskById", {
                    taskId: id,
                    taskStatus: task.status as TaskStatus,
                    taskPriority: task.priority as TaskPriority,
                    startTime: eventStartTime,
                    attributes: {
                        "task.status": task.status,
                        "task.priority": task.priority,
                    },
                });

                span.end();
                await meterProvider.forceFlush();
                return { success: true, task };
            } catch (error: unknown) {
                recordErrorEvent(span, "getTaskById", error, {
                    taskId: id,
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to fetch task",
                    task: null,
                };
            }
        }
    );
}

/**
 * Crea una nueva tarea
 */
export async function createTask(formData: FormData) {
    const projectId = formData.get("projectId") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const status = (formData.get("status") as TaskStatus) || "TODO";
    const priority = (formData.get("priority") as TaskPriority) || "MEDIUM";
    const dueDate = formData.get("dueDate") as string;

    const tracer = trace.getTracer("tasks-actions");

    if (!title?.trim()) {
        logIssue(SeverityNumber.WARN, "WARN", "Task title validation failed", {
            "validation.field": "title",
            "validation.error": "Task title is required",
        });
        return { success: false, error: "Task title is required" };
    }

    if (!projectId) {
        return { success: false, error: "Project ID is required" };
    }

    logIssue(SeverityNumber.INFO, "INFO", "Starting task creation", {
        "task.title": title.trim(),
        "task.status": status,
        "project.id": projectId,
    });

    return await tracer.startActiveSpan(
        "tasks.createTask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "createTask", {
                    projectId,
                    taskStatus: status,
                    taskPriority: priority,
                });

                const { data: task, errors } =
                    await cookieBasedClient.models.Task.create(
                        {
                            projectId,
                            title: title.trim(),
                            description: description?.trim() || null,
                            status,
                            priority,
                            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                        { selectionSet: TASK_SELECTION_SET }
                    );

                if (errors) {
                    recordErrorEvent(span, "createTask", new Error(JSON.stringify(errors)), {
                        projectId,
                        taskStatus: status,
                        taskPriority: priority,
                        errorType: "database",
                    });

                    span.end();
                    await meterProvider.forceFlush();
                    return { success: false, error: "Failed to create task" };
                }

                recordCompleteEvent(span, "createTask", {
                    projectId,
                    taskId: task?.id,
                    taskStatus: status,
                    taskPriority: priority,
                    startTime: eventStartTime,
                    attributes: {
                        "task.title": title.trim(),
                    },
                });

                logIssue(SeverityNumber.INFO, "INFO", "Task created successfully", {
                    "task.id": task?.id || "unknown",
                    "task.title": title.trim(),
                    "task.status": status,
                });

                span.end();
                revalidatePath(`/projects/${projectId}`);
                await meterProvider.forceFlush();
                return { success: true, task };
            } catch (error: unknown) {
                recordErrorEvent(span, "createTask", error, {
                    projectId,
                    taskStatus: status,
                    taskPriority: priority,
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to create task",
                };
            }
        }
    );
}

/**
 * Actualiza una tarea existente
 */
export async function updateTask(id: string, formData: FormData) {
    const projectId = formData.get("projectId") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const status = formData.get("status") as TaskStatus;
    const priority = formData.get("priority") as TaskPriority;
    const dueDate = formData.get("dueDate") as string;

    const tracer = trace.getTracer("tasks-actions");

    if (!title?.trim()) {
        logIssue(SeverityNumber.WARN, "WARN", "Task title validation failed", {
            "validation.field": "title",
            "validation.error": "Task title is required",
            "task.id": id,
        });
        return { success: false, error: "Task title is required" };
    }

    logIssue(SeverityNumber.INFO, "INFO", "Starting task update", {
        "task.id": id,
        "task.title": title.trim(),
        "task.status": status,
        "task.priority": priority,
    });

    return await tracer.startActiveSpan(
        "tasks.updateTask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "updateTask", {
                    projectId,
                    taskId: id,
                    taskStatus: status,
                    taskPriority: priority,
                });

                const { data: task, errors } =
                    await cookieBasedClient.models.Task.update(
                        {
                            id,
                            title: title.trim(),
                            description: description?.trim() || null,
                            status,
                            priority,
                            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
                            updatedAt: new Date().toISOString(),
                        },
                        { selectionSet: TASK_SELECTION_SET }
                    );

                if (errors) {
                    recordErrorEvent(span, "updateTask", new Error(JSON.stringify(errors)), {
                        projectId,
                        taskId: id,
                        taskStatus: status,
                        taskPriority: priority,
                        errorType: "database",
                    });

                    span.end();
                    await meterProvider.forceFlush();
                    return { success: false, error: "Failed to update task" };
                }

                recordCompleteEvent(span, "updateTask", {
                    projectId,
                    taskId: id,
                    taskStatus: status,
                    taskPriority: priority,
                    startTime: eventStartTime,
                    attributes: {
                        "task.title": title.trim(),
                    },
                });

                logIssue(SeverityNumber.INFO, "INFO", "Task updated successfully", {
                    "task.id": id,
                    "task.title": title.trim(),
                    "task.status": status,
                    "task.priority": priority,
                });

                span.end();
                if (projectId) {
                    revalidatePath(`/projects/${projectId}`);
                }
                await meterProvider.forceFlush();
                return { success: true, task };
            } catch (error: unknown) {
                recordErrorEvent(span, "updateTask", error, {
                    projectId,
                    taskId: id,
                    taskStatus: status,
                    taskPriority: priority,
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to update task",
                };
            }
        }
    );
}

/**
 * Elimina una tarea existente
 */
export async function deleteTask(id: string, projectId: string) {
    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.deleteTask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "deleteTask", {
                    taskId: id,
                    projectId,
                });

                const { errors } = await cookieBasedClient.models.Task.delete({ id });

                if (errors) {
                    recordErrorEvent(span, "deleteTask", new Error(JSON.stringify(errors)), {
                        taskId: id,
                        projectId,
                        errorType: "database",
                    });

                    span.end();
                    await meterProvider.forceFlush();
                    return { success: false, error: "Failed to delete task" };
                }

                recordCompleteEvent(span, "deleteTask", {
                    taskId: id,
                    projectId,
                    startTime: eventStartTime,
                    attributes: {
                        "task.deleted.id": id,
                    },
                });

                span.end();
                revalidatePath(`/projects/${projectId}`);
                await meterProvider.forceFlush();
                return { success: true };
            } catch (error: unknown) {
                recordErrorEvent(span, "deleteTask", error, {
                    taskId: id,
                    projectId,
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to delete task",
                };
            }
        }
    );
}

/**
 * Obtiene todas las tareas del sistema
 */
export async function getAllTasks() {
    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.getAllTasks",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "getAllTasks", {});

                const { data: tasks, errors } =
                    await cookieBasedClient.models.Task.list({
                        selectionSet: TASK_SELECTION_SET,
                    });

                if (errors) {
                    recordErrorEvent(span, "getAllTasks", new Error(JSON.stringify(errors)), {
                        errorType: "database",
                    });

                    span.end();
                    await meterProvider.forceFlush();
                    return {
                        success: false,
                        error: "Failed to fetch tasks",
                        tasks: [],
                    };
                }

                const tasksList = tasks || [];
                const statusCounts = tasksList.reduce((acc: any, t: any) => {
                    const key = t.status ?? "UNKNOWN";
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

                const priorityCounts = tasksList.reduce((acc: any, t: any) => {
                    const key = t.priority ?? "UNKNOWN";
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

                recordCompleteEvent(span, "getAllTasks", {
                    startTime: eventStartTime,
                    attributes: {
                        "query.result.count": tasksList.length.toString(),
                        "tasks.todo": statusCounts.TODO || 0,
                        "tasks.in_progress": statusCounts.IN_PROGRESS || 0,
                        "tasks.completed": statusCounts.COMPLETED || 0,
                        "tasks.priority.low": priorityCounts.LOW || 0,
                        "tasks.priority.medium": priorityCounts.MEDIUM || 0,
                        "tasks.priority.high": priorityCounts.HIGH || 0,
                    },
                });

                span.end();
                await meterProvider.forceFlush();
                return { success: true, tasks: tasksList };
            } catch (error: unknown) {
                recordErrorEvent(span, "getAllTasks", error, {
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to fetch tasks",
                    tasks: [],
                };
            }
        }
    );
}