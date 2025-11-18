"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";
import { trace, metrics, Span, SpanStatusCode } from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

// ============================================================================
// Tipos de Datos
// ============================================================================

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

// ============================================================================
// Métricas Personalizadas (Coherente con projects.ts)
// ============================================================================

const meter = metrics.getMeter("tasks-events");

const taskEventsCounter = meter.createCounter("tasks.events", {
    description: "Business events in task operations",
    unit: "1",
});

const taskCreationPhaseCounter = meter.createCounter("tasks.creation.phase", {
    description: "Task creation lifecycle phases",
    unit: "1",
});

const taskUpdatePhaseCounter = meter.createCounter("tasks.update.phase", {
    description: "Task update lifecycle phases",
    unit: "1",
});

const taskFetchPhaseCounter = meter.createCounter("tasks.fetch.phase", {
    description: "Task fetch lifecycle phases",
    unit: "1",
});

const taskProcessingTime = meter.createHistogram("tasks.processing.time", {
    description: "Time between start and completion events",
    unit: "ms",
});

// ============================================================================
// Logger (Coherente con tasks.ts actual)
// ============================================================================

const logger = logs.getLogger("tasks-actions", "1.0.0");

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

// ============================================================================
// Utilitarios para Atributos y Métricas Comunes
// ============================================================================

interface TaskSpanContextData {
    projectId?: string;
    taskId?: string;
    taskStatus?: TaskStatus;
    taskPriority?: TaskPriority;
}

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

function getActionAttributes(actionName: string, actionType: "create" | "read" | "update" | "delete") {
    return {
        "action.name": actionName,
        "action.type": actionType,
        "operation.type": actionType,
    };
}

// ============================================================================
// Utilidad para iniciar y registrar métricas
// ============================================================================

function recordStartEvent(
    span: Span,
    operationName: string,
    context: { projectId?: string; taskId?: string; taskStatus?: TaskStatus; taskPriority?: TaskPriority; phaseCounter: any; }
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

    // 📊 MÉTRICAS
    context.phaseCounter.add(1, {
        "phase": "started",
        "operation": operationName,
        ...(context.taskStatus && { "task.status": context.taskStatus }),
    });

    taskEventsCounter.add(1, {
        "event.name": `task.${actionAttrs["action.type"]}.started`,
        "operation": operationName,
        "task.id": context.taskId || "none",
        "project.id": context.projectId || "none",
    });
}

// ============================================================================
// Utilidad para completar y registrar métricas
// ============================================================================

function recordCompleteEvent(
    span: Span,
    operationName: string,
    context: { projectId?: string; taskId?: string; taskStatus?: TaskStatus; taskPriority?: TaskPriority; phaseCounter: any; startTime: number; attributes?: Record<string, any> }
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
        "processing_time_ms": processingTime,
        ...context.attributes,
    });

    // 📊 MÉTRICAS
    context.phaseCounter.add(1, {
        "phase": "completed",
        "operation": operationName,
        ...(context.taskStatus && { "task.status": context.taskStatus }),
    });

    taskEventsCounter.add(1, {
        "event.name": `task.${operationName.includes("create") ? "create" : operationName.includes("read") ? "fetch" : operationName.includes("update") ? "update" : "delete"}.completed`,
        "operation": operationName,
        "task.id": context.taskId || "none",
        "project.id": context.projectId || "none",
    });

    taskProcessingTime.record(processingTime, {
        "operation": operationName,
        "task.id": context.taskId || "none",
        "project.id": context.projectId || "none",
        ...(context.taskStatus && { "task.status": context.taskStatus }),
    });
}

// ============================================================================
// Utilidad para manejar y registrar errores
// ============================================================================

function recordErrorEvent(
    span: Span,
    operationName: string,
    error: unknown,
    context: { projectId?: string; taskId?: string; taskStatus?: TaskStatus; taskPriority?: TaskPriority; phaseCounter: any; errorType: "database" | "runtime" }
) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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

    // 📊 MÉTRICAS
    context.phaseCounter.add(1, {
        "phase": context.errorType === "database" ? "error" : "exception",
        "operation": operationName,
        ...(context.taskStatus && { "task.status": context.taskStatus }),
    });

    taskEventsCounter.add(1, {
        "event.name": `task.${operationName.includes("create") ? "create" : operationName.includes("read") ? "fetch" : operationName.includes("update") ? "update" : "delete"}.exception`,
        "operation": operationName,
        "task.id": context.taskId || "none",
        "project.id": context.projectId || "none",
    });

    // 🪵 LOG
    logIssue(SeverityNumber.ERROR, "ERROR", `${operationName} failed`, {
        "error.message": errorMessage,
        "error.type": context.errorType,
        "task.id": context.taskId,
        "project.id": context.projectId,
    });

    console.error(`${operationName} error:`, error);
}

// ============================================================================
// OPERACIÓN: getTasksByProjectId (READ)
// ============================================================================

export async function getTasksByProjectId(projectId: string) {
    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.getTasksByProjectId",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "getTasksByProjectId", {
                    projectId,
                    phaseCounter: taskFetchPhaseCounter,
                });

                const { data: tasks, errors } =
                    await cookieBasedClient.models.Task.list({
                        filter: { projectId: { eq: projectId } },
                        selectionSet: TASK_SELECTION_SET,
                    });

                if (errors) {
                    recordErrorEvent(span, "getTasksByProjectId", new Error(JSON.stringify(errors)), {
                        projectId,
                        phaseCounter: taskFetchPhaseCounter,
                        errorType: "database",
                    });

                    span.end();
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
                    phaseCounter: taskFetchPhaseCounter,
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
                    phaseCounter: taskFetchPhaseCounter,
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

// ============================================================================
// OPERACIÓN: getTaskById (READ)
// ============================================================================

export async function getTaskById(id: string) {
    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.getTaskById",
        async (span) => {
            try {
                const commonAttrs = getCommonAttributes({ taskId: id });
                const actionAttrs = getActionAttributes("getTaskById", "read");

                span.setAttributes({
                    ...commonAttrs,
                    ...actionAttrs,
                    "operation.phase": "started",
                    "operation.status": "pending",
                });
                span.addEvent("operation.phase.started");

                const { data: task, errors } =
                    await cookieBasedClient.models.Task.get(
                        { id },
                        { selectionSet: TASK_SELECTION_SET }
                    );

                if (errors) {
                    recordErrorEvent(span, "getTaskById", new Error(JSON.stringify(errors)), {
                        taskId: id,
                        phaseCounter: taskFetchPhaseCounter,
                        errorType: "database",
                    });
                    span.end();
                    return { success: false, error: "Failed to fetch task", task: null };
                }

                if (!task) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: "Task not found" });
                    span.setAttributes({
                        "operation.status": "failed",
                        "error.type": "not_found",
                    });
                    span.end();
                    return { success: false, error: "Task not found", task: null };
                }

                span.setAttributes({
                    "task.status": task.status || "unknown",
                    "task.priority": task.priority || "unknown",
                    "operation.phase": "completed",
                    "operation.status": "success",
                });
                span.setStatus({ code: SpanStatusCode.OK });
                span.addEvent("operation.phase.completed");

                span.end();
                return { success: true, task };
            } catch (error: unknown) {
                recordErrorEvent(span, "getTaskById", error, {
                    taskId: id,
                    phaseCounter: taskFetchPhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to fetch task",
                    task: null,
                };
            }
        }
    );
}

// ============================================================================
// OPERACIÓN: createTask (CREATE)
// ============================================================================

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
                    phaseCounter: taskCreationPhaseCounter,
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
                        phaseCounter: taskCreationPhaseCounter,
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
                    phaseCounter: taskCreationPhaseCounter,
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
                    phaseCounter: taskCreationPhaseCounter,
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

// ============================================================================
// OPERACIÓN: updateTask (UPDATE)
// ============================================================================

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
                    phaseCounter: taskUpdatePhaseCounter,
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
                        phaseCounter: taskUpdatePhaseCounter,
                        errorType: "database",
                    });

                    span.end();
                    return { success: false, error: "Failed to update task" };
                }

                recordCompleteEvent(span, "updateTask", {
                    projectId,
                    taskId: id,
                    taskStatus: status,
                    taskPriority: priority,
                    startTime: eventStartTime,
                    phaseCounter: taskUpdatePhaseCounter,
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
                return { success: true, task };
            } catch (error: unknown) {
                recordErrorEvent(span, "updateTask", error, {
                    projectId,
                    taskId: id,
                    taskStatus: status,
                    taskPriority: priority,
                    phaseCounter: taskUpdatePhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to update task",
                };
            }
        }
    );
}

// ============================================================================
// OPERACIÓN: deleteTask (DELETE)
// ============================================================================

export async function deleteTask(id: string, projectId: string) {
    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.deleteTask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                const commonAttrs = getCommonAttributes({ taskId: id, projectId });
                const actionAttrs = getActionAttributes("deleteTask", "delete");

                span.setAttributes({
                    ...commonAttrs,
                    ...actionAttrs,
                    "operation.phase": "started",
                    "operation.status": "pending",
                });
                span.addEvent("operation.phase.started");

                taskUpdatePhaseCounter.add(1, {
                    "phase": "started",
                    "operation": "deleteTask",
                });
                taskEventsCounter.add(1, {
                    "event.name": "task.delete.started",
                    "operation": "deleteTask",
                    "task.id": id,
                    "project.id": projectId,
                });

                const { errors } = await cookieBasedClient.models.Task.delete({ id });

                if (errors) {
                    recordErrorEvent(span, "deleteTask", new Error(JSON.stringify(errors)), {
                        taskId: id,
                        projectId,
                        phaseCounter: taskUpdatePhaseCounter,
                        errorType: "database",
                    });

                    span.end();
                    return { success: false, error: "Failed to delete task" };
                }

                recordCompleteEvent(span, "deleteTask", {
                    taskId: id,
                    projectId,
                    startTime: eventStartTime,
                    phaseCounter: taskUpdatePhaseCounter,
                    attributes: {
                        "task.deleted.id": id,
                    },
                });

                span.end();
                revalidatePath(`/projects/${projectId}`);
                return { success: true };
            } catch (error: unknown) {
                recordErrorEvent(span, "deleteTask", error, {
                    taskId: id,
                    projectId,
                    phaseCounter: taskUpdatePhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to delete task",
                };
            }
        }
    );
}

// ============================================================================
// OPERACIÓN: getAllTasks (READ - Global)
// ============================================================================

export async function getAllTasks() {
    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.getAllTasks",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "getAllTasks", {
                    phaseCounter: taskFetchPhaseCounter,
                });

                const { data: tasks, errors } =
                    await cookieBasedClient.models.Task.list({
                        selectionSet: TASK_SELECTION_SET,
                    });

                if (errors) {
                    recordErrorEvent(span, "getAllTasks", new Error(JSON.stringify(errors)), {
                        phaseCounter: taskFetchPhaseCounter,
                        errorType: "database",
                    });

                    span.end();
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
                    phaseCounter: taskFetchPhaseCounter,
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
                    phaseCounter: taskFetchPhaseCounter,
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