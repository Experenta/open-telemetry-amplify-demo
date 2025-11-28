"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";
import { trace, metrics, Span, SpanStatusCode } from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider";
import { flushTraces } from "@/lib/otel-utils";

// ============================================================================
// Métricas Personalizadas (Coherente con projects.ts)
// ============================================================================

const meter = metrics.getMeter("subtasks-events");

const subtaskEventsCounter = meter.createCounter("subtasks.events", {
    description: "Business events in subtask operations",
    unit: "1",
});

const subtaskCreationPhaseCounter = meter.createCounter("subtasks.creation.phase", {
    description: "Subtask creation lifecycle phases",
    unit: "1",
});

const subtaskUpdatePhaseCounter = meter.createCounter("subtasks.update.phase", {
    description: "Subtask update lifecycle phases",
    unit: "1",
});

const subtaskFetchPhaseCounter = meter.createCounter("subtasks.fetch.phase", {
    description: "Subtask fetch lifecycle phases",
    unit: "1",
});

const subtaskProcessingTime = meter.createHistogram("subtasks.processing.time", {
    description: "Time between start and completion events",
    unit: "ms",
});

// ============================================================================
// Utilitarios para Atributos Comunes
// ============================================================================

interface SubtaskSpanContextData {
    projectId?: string;
    taskId: string;
    subtaskId?: string;
    subtaskCompleted?: boolean;
}

function getCommonAttributes(data: SubtaskSpanContextData) {
    return {
        "service.name": "project-management",
        "service.module": "subtasks",
        "resource.type": "subtask",
        "resource.id": data.subtaskId || "unknown",
        "resource.parent.type": "task",
        "resource.parent.id": data.taskId,
        "resource.parent.parent.type": "project",
        "resource.parent.parent.id": data.projectId || "unknown",
        "subtask.isCompleted": data.subtaskCompleted?.toString() || "unknown",
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
    context: { projectId?: string; taskId: string; subtaskId?: string; subtaskCompleted?: boolean; phaseCounter: any; }
) {
    const commonAttrs = getCommonAttributes(context);
    const actionAttrs = getActionAttributes(
        operationName,
        operationName.includes("create") ? "create" : operationName.includes("read") ? "read" : operationName.includes("update") || operationName.includes("toggle") ? "update" : "delete"
    );

    span.setAttributes({
        ...commonAttrs,
        ...actionAttrs,
        "operation.phase": "started",
        "operation.status": "pending",
    });

    span.addEvent("operation.phase.started", {
        "operation.phase": "started",
        "resource.type": "subtask",
        "action.type": actionAttrs["action.type"],
    });

    // 📊 MÉTRICAS
    context.phaseCounter.add(1, {
        "phase": "started",
        "operation": operationName,
        ...(context.subtaskCompleted !== undefined && { "subtask.isCompleted": context.subtaskCompleted.toString() }),
    });

    subtaskEventsCounter.add(1, {
        "event.name": `subtask.${actionAttrs["action.type"]}.started`,
        "operation": operationName,
        "subtask.id": context.subtaskId || "none",
        "task.id": context.taskId,
        "project.id": context.projectId || "none",
    });
}

// ============================================================================
// Utilidad para completar y registrar métricas
// ============================================================================

function recordCompleteEvent(
    span: Span,
    operationName: string,
    context: { projectId?: string; taskId: string; subtaskId?: string; subtaskCompleted?: boolean; phaseCounter: any; startTime: number; attributes?: Record<string, any> }
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
        ...(context.subtaskCompleted !== undefined && { "subtask.isCompleted": context.subtaskCompleted.toString() }),
    });

    subtaskEventsCounter.add(1, {
        "event.name": `subtask.${operationName.includes("create") ? "create" : operationName.includes("read") ? "fetch" : operationName.includes("update") || operationName.includes("toggle") ? "update" : "delete"}.completed`,
        "operation": operationName,
        "subtask.id": context.subtaskId || "none",
        "task.id": context.taskId,
        "project.id": context.projectId || "none",
    });

    subtaskProcessingTime.record(processingTime, {
        "operation": operationName,
        "subtask.id": context.subtaskId || "none",
        "task.id": context.taskId,
        "project.id": context.projectId || "none",
        ...(context.subtaskCompleted !== undefined && { "subtask.isCompleted": context.subtaskCompleted.toString() }),
    });
}

// ============================================================================
// Utilidad para manejar y registrar errores
// ============================================================================

function recordErrorEvent(
    span: Span,
    operationName: string,
    error: unknown,
    context: { projectId?: string; taskId: string; subtaskId?: string; subtaskCompleted?: boolean; phaseCounter: any; errorType: "database" | "runtime" }
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
        ...(context.subtaskCompleted !== undefined && { "subtask.isCompleted": context.subtaskCompleted.toString() }),
    });

    subtaskEventsCounter.add(1, {
        "event.name": `subtask.${operationName.includes("create") ? "create" : operationName.includes("read") ? "fetch" : operationName.includes("update") || operationName.includes("toggle") ? "update" : "delete"}.exception`,
        "operation": operationName,
        "subtask.id": context.subtaskId || "none",
        "task.id": context.taskId,
        "project.id": context.projectId || "none",
    });

    console.error(`${operationName} error:`, error);
}

// ============================================================================
// OPERACIÓN: getSubtasksByTaskId (READ)
// ============================================================================

export async function getSubtasksByTaskId(taskId: string, projectId?: string) {
    const tracer = trace.getTracer("subtasks-actions");

    return await tracer.startActiveSpan(
        "subtasks.getSubtasksByTaskId",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "getSubtasksByTaskId", {
                    taskId,
                    projectId,
                    phaseCounter: subtaskFetchPhaseCounter,
                });

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
                    recordErrorEvent(span, "getSubtasksByTaskId", new Error(JSON.stringify(errors)), {
                        taskId,
                        projectId,
                        phaseCounter: subtaskFetchPhaseCounter,
                        errorType: "database",
                    });

                    span.end();
                    return {
                        success: false,
                        error: "Failed to fetch subtasks",
                        subtasks: [],
                    };
                }

                const subtasksList = subtasks || [];
                const completedCount = subtasksList.filter((st) => st.isCompleted).length;
                const pendingCount = subtasksList.length - completedCount;
                const completionRate = subtasksList.length > 0
                    ? (completedCount / subtasksList.length) * 100
                    : 0;

                recordCompleteEvent(span, "getSubtasksByTaskId", {
                    taskId,
                    projectId,
                    startTime: eventStartTime,
                    phaseCounter: subtaskFetchPhaseCounter,
                    attributes: {
                        "query.result.count": subtasksList.length.toString(),
                        "query.result.completed": completedCount.toString(),
                        "query.result.pending": pendingCount.toString(),
                        "query.result.completion_rate": completionRate.toFixed(2),
                    },
                });

                span.end();
                await meterProvider.forceFlush();
                await flushTraces();
                return { success: true, subtasks: subtasksList };
            } catch (error: unknown) {
                recordErrorEvent(span, "getSubtasksByTaskId", error, {
                    taskId,
                    projectId,
                    phaseCounter: subtaskFetchPhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                await flushTraces();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to fetch subtasks",
                    subtasks: [],
                };
            }
        }
    );
}

// ============================================================================
// OPERACIÓN: createSubtask (CREATE)
// ============================================================================

export async function createSubtask(formData: FormData) {
    const taskId = formData.get("taskId") as string;
    const projectId = formData.get("projectId") as string;
    const title = formData.get("title") as string;

    const tracer = trace.getTracer("subtasks-actions");

    if (!title?.trim()) {
        return { success: false, error: "Subtask title is required" };
    }

    if (!taskId) {
        return { success: false, error: "Task ID is required" };
    }

    return await tracer.startActiveSpan(
        "subtasks.createSubtask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "createSubtask", {
                    taskId,
                    projectId,
                    subtaskCompleted: false,
                    phaseCounter: subtaskCreationPhaseCounter,
                });

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
                    recordErrorEvent(span, "createSubtask", new Error(JSON.stringify(errors)), {
                        taskId,
                        projectId,
                        subtaskCompleted: false,
                        phaseCounter: subtaskCreationPhaseCounter,
                        errorType: "database",
                    });

                    span.end();
                    await meterProvider.forceFlush();
                await flushTraces();
                    return { success: false, error: "Failed to create subtask" };
                }

                recordCompleteEvent(span, "createSubtask", {
                    taskId,
                    projectId,
                    subtaskId: subtask?.id,
                    subtaskCompleted: false,
                    startTime: eventStartTime,
                    phaseCounter: subtaskCreationPhaseCounter,
                    attributes: {
                        "subtask.title": title.trim(),
                    },
                });

                span.end();
                if (projectId) {
                    revalidatePath(`/projects/${projectId}`);
                }
                await meterProvider.forceFlush();
                await flushTraces();
                return { success: true, subtask };
            } catch (error: unknown) {
                recordErrorEvent(span, "createSubtask", error, {
                    taskId,
                    projectId,
                    subtaskCompleted: false,
                    phaseCounter: subtaskCreationPhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                await flushTraces();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to create subtask",
                };
            }
        }
    );
}

// ============================================================================
// OPERACIÓN: updateSubtask (UPDATE)
// ============================================================================

export async function updateSubtask(id: string, formData: FormData) {
    const taskId = formData.get("taskId") as string;
    const projectId = formData.get("projectId") as string;
    const title = formData.get("title") as string;
    const isCompleted = formData.get("isCompleted") === "true";

    const tracer = trace.getTracer("subtasks-actions");

    return await tracer.startActiveSpan(
        "subtasks.updateSubtask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "updateSubtask", {
                    taskId,
                    projectId,
                    subtaskId: id,
                    subtaskCompleted: isCompleted,
                    phaseCounter: subtaskUpdatePhaseCounter,
                });

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
                    recordErrorEvent(span, "updateSubtask", new Error(JSON.stringify(errors)), {
                        taskId,
                        projectId,
                        subtaskId: id,
                        subtaskCompleted: isCompleted,
                        phaseCounter: subtaskUpdatePhaseCounter,
                        errorType: "database",
                    });

                    span.end();
                    return { success: false, error: "Failed to update subtask" };
                }

                recordCompleteEvent(span, "updateSubtask", {
                    taskId,
                    projectId,
                    subtaskId: id,
                    subtaskCompleted: isCompleted,
                    startTime: eventStartTime,
                    phaseCounter: subtaskUpdatePhaseCounter,
                    attributes: {
                        "subtask.title": title.trim(),
                    },
                });

                span.end();
                if (projectId) {
                    revalidatePath(`/projects/${projectId}`);
                }
                return { success: true, subtask };
            } catch (error: unknown) {
                recordErrorEvent(span, "updateSubtask", error, {
                    taskId,
                    projectId,
                    subtaskId: id,
                    subtaskCompleted: isCompleted,
                    phaseCounter: subtaskUpdatePhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to update subtask",
                };
            }
        }
    );
}

// ============================================================================
// OPERACIÓN: toggleSubtask (UPDATE - Especializado)
// ============================================================================

export async function toggleSubtask(
    id: string,
    isCompleted: boolean,
    taskId: string,
    projectId?: string
) {
    const tracer = trace.getTracer("subtasks-actions");

    return await tracer.startActiveSpan(
        "subtasks.toggleSubtask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "toggleSubtask", {
                    taskId,
                    projectId,
                    subtaskId: id,
                    subtaskCompleted: isCompleted,
                    phaseCounter: subtaskUpdatePhaseCounter,
                });

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
                    recordErrorEvent(span, "toggleSubtask", new Error(JSON.stringify(errors)), {
                        taskId,
                        projectId,
                        subtaskId: id,
                        subtaskCompleted: isCompleted,
                        phaseCounter: subtaskUpdatePhaseCounter,
                        errorType: "database",
                    });

                    span.end();
                    return { success: false, error: "Failed to toggle subtask" };
                }

                recordCompleteEvent(span, "toggleSubtask", {
                    taskId,
                    projectId,
                    subtaskId: id,
                    subtaskCompleted: isCompleted,
                    startTime: eventStartTime,
                    phaseCounter: subtaskUpdatePhaseCounter,
                    attributes: {
                        "operation.subtype": "toggle",
                    },
                });

                span.end();
                if (projectId) {
                    revalidatePath(`/projects/${projectId}`);
                }
                return { success: true, subtask };
            } catch (error: unknown) {
                recordErrorEvent(span, "toggleSubtask", error, {
                    taskId,
                    projectId,
                    subtaskId: id,
                    subtaskCompleted: isCompleted,
                    phaseCounter: subtaskUpdatePhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to toggle subtask",
                };
            }
        }
    );
}

// ============================================================================
// OPERACIÓN: deleteSubtask (DELETE)
// ============================================================================

export async function deleteSubtask(
    id: string,
    taskId: string,
    projectId?: string
) {
    const tracer = trace.getTracer("subtasks-actions");

    return await tracer.startActiveSpan(
        "subtasks.deleteSubtask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                const commonAttrs = getCommonAttributes({
                    taskId,
                    projectId,
                    subtaskId: id,
                });
                const actionAttrs = getActionAttributes("deleteSubtask", "delete");

                span.setAttributes({
                    ...commonAttrs,
                    ...actionAttrs,
                    "operation.phase": "started",
                    "operation.status": "pending",
                });
                span.addEvent("operation.phase.started");

                subtaskUpdatePhaseCounter.add(1, {
                    "phase": "started",
                    "operation": "deleteSubtask",
                });
                subtaskEventsCounter.add(1, {
                    "event.name": "subtask.delete.started",
                    "operation": "deleteSubtask",
                    "subtask.id": id,
                    "task.id": taskId,
                    "project.id": projectId || "none",
                });

                const { errors } = await cookieBasedClient.models.Subtask.delete({
                    id,
                });

                if (errors) {
                    recordErrorEvent(span, "deleteSubtask", new Error(JSON.stringify(errors)), {
                        taskId,
                        projectId,
                        subtaskId: id,
                        phaseCounter: subtaskUpdatePhaseCounter,
                        errorType: "database",
                    });

                    span.end();
                    return { success: false, error: "Failed to delete subtask" };
                }

                recordCompleteEvent(span, "deleteSubtask", {
                    taskId,
                    projectId,
                    subtaskId: id,
                    startTime: eventStartTime,
                    phaseCounter: subtaskUpdatePhaseCounter,
                    attributes: {
                        "subtask.deleted.id": id,
                    },
                });

                span.end();
                if (projectId) {
                    revalidatePath(`/projects/${projectId}`);
                }
                return { success: true };
            } catch (error: unknown) {
                recordErrorEvent(span, "deleteSubtask", error, {
                    taskId,
                    projectId,
                    subtaskId: id,
                    phaseCounter: subtaskUpdatePhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to delete subtask",
                };
            }
        }
    );
}

// ============================================================================
// OPERACIÓN: getAllSubtasks (READ - Global)
// ============================================================================

export async function getAllSubtasks() {
    const tracer = trace.getTracer("subtasks-actions");

    return await tracer.startActiveSpan(
        "subtasks.getAllSubtasks",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                recordStartEvent(span, "getAllSubtasks", {
                    taskId: "none",
                    phaseCounter: subtaskFetchPhaseCounter,
                });

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
                    recordErrorEvent(span, "getAllSubtasks", new Error(JSON.stringify(errors)), {
                        taskId: "none",
                        phaseCounter: subtaskFetchPhaseCounter,
                        errorType: "database",
                    });

                    span.end();
                    return {
                        success: false,
                        error: "Failed to fetch subtasks",
                        subtasks: [],
                    };
                }

                const subtasksList = subtasks || [];
                const completedCount = subtasksList.filter((s) => s.isCompleted).length;
                const pendingCount = subtasksList.length - completedCount;
                const completionRate = subtasksList.length > 0
                    ? (completedCount / subtasksList.length) * 100
                    : 0;

                recordCompleteEvent(span, "getAllSubtasks", {
                    taskId: "none",
                    startTime: eventStartTime,
                    phaseCounter: subtaskFetchPhaseCounter,
                    attributes: {
                        "query.result.count": subtasksList.length.toString(),
                        "query.result.completed": completedCount.toString(),
                        "query.result.pending": pendingCount.toString(),
                        "query.result.completion_rate": completionRate.toFixed(2),
                    },
                });

                span.end();
                await meterProvider.forceFlush();
                await flushTraces();
                return { success: true, subtasks: subtasksList };
            } catch (error: unknown) {
                recordErrorEvent(span, "getAllSubtasks", error, {
                    taskId: "none",
                    phaseCounter: subtaskFetchPhaseCounter,
                    errorType: "runtime",
                });

                span.end();
                await meterProvider.forceFlush();
                await flushTraces();
                return {
                    success: false,
                    error: (error as Error).message || "Failed to fetch subtasks",
                    subtasks: [],
                };
            }
        }
    );
}