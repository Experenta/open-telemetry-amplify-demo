// ============================================================================
// ANTES: Sin atributos adicionales
// ============================================================================

function recordStartEvent(
    span: Span,
    operationName: string,
    context: { 
        projectId?: string; 
        taskId?: string; 
        taskStatus?: TaskStatus; 
        taskPriority?: TaskPriority; 
        phaseCounter: any;
    }
) {
    // ...código...

    // 📊 Phase counter - Mínimo
    context.phaseCounter.add(1, {
        "phase": "started",
        "operation": operationName,
        ...(context.taskStatus && { "task.status": context.taskStatus }),
    });
}

// ============================================================================
// DESPUÉS: Con atributos adicionales
// ============================================================================

function recordStartEvent(
    span: Span,
    operationName: string,
    context: { 
        projectId?: string; 
        taskId?: string; 
        taskStatus?: TaskStatus; 
        taskPriority?: TaskPriority; 
        phaseCounter: any;
    }
) {
    // ...código...

    // 📊 Phase counter - Con más atributos
    context.phaseCounter.add(1, {
        "phase": "started",
        "operation": operationName,
        ...(context.taskStatus && { "task.status": context.taskStatus }),
        ...(context.taskPriority && { "task.priority": context.taskPriority }),
        ...(context.projectId && { "project.id": context.projectId }),
        ...(context.taskId && { "task.id": context.taskId }),
    });
}

// ============================================================================
// recordCompleteEvent CON ATRIBUTOS
// ============================================================================

function recordCompleteEvent(
    span: Span,
    operationName: string,
    context: { 
        projectId?: string; 
        taskId?: string; 
        taskStatus?: TaskStatus; 
        taskPriority?: TaskPriority; 
        phaseCounter: any; 
        startTime: number;
        attributes?: Record<string, any>;
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
        "processing_time_ms": processingTime,
        ...context.attributes,
    });

    // 📊 Phase counter - Con atributos
    context.phaseCounter.add(1, {
        "phase": "completed",
        "operation": operationName,
        ...(context.taskStatus && { "task.status": context.taskStatus }),
        ...(context.taskPriority && { "task.priority": context.taskPriority }),
        ...(context.projectId && { "project.id": context.projectId }),
        ...(context.taskId && { "task.id": context.taskId }),
        "processing_time_ms": processingTime.toString(),  // ← NUEVO
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
// recordErrorEvent CON ATRIBUTOS
// ============================================================================

function recordErrorEvent(
    span: Span,
    operationName: string,
    error: unknown,
    context: { 
        projectId?: string; 
        taskId?: string; 
        taskStatus?: TaskStatus; 
        taskPriority?: TaskPriority; 
        phaseCounter: any; 
        errorType: "database" | "runtime";
    }
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

    // 📊 Phase counter - Con atributos de error
    context.phaseCounter.add(1, {
        "phase": context.errorType === "database" ? "error" : "exception",
        "operation": operationName,
        ...(context.taskStatus && { "task.status": context.taskStatus }),
        ...(context.taskPriority && { "task.priority": context.taskPriority }),
        ...(context.projectId && { "project.id": context.projectId }),
        ...(context.taskId && { "task.id": context.taskId }),
        "error.type": context.errorType,                          // ← NUEVO
        "error.message": errorMessage,                            // ← NUEVO
    });

    taskEventsCounter.add(1, {
        "event.name": `task.${operationName.includes("create") ? "create" : operationName.includes("read") ? "fetch" : operationName.includes("update") ? "update" : "delete"}.exception`,
        "operation": operationName,
        "task.id": context.taskId || "none",
        "project.id": context.projectId || "none",
    });

    logIssue(SeverityNumber.ERROR, "ERROR", `${operationName} failed`, {
        "error.message": errorMessage,
        "error.type": context.errorType,
        "task.id": context.taskId,
        "project.id": context.projectId,
    });

    console.error(`${operationName} error:`, error);
}

// ============================================================================
// EJEMPLO: Cómo se vería en createTask
// ============================================================================

export async function createTask(formData: FormData) {
    const projectId = formData.get("projectId") as string;
    const title = formData.get("title") as string;
    const status = (formData.get("status") as TaskStatus) || "TODO";
    const priority = (formData.get("priority") as TaskPriority) || "MEDIUM";
    const dueDate = formData.get("dueDate") as string;

    const tracer = trace.getTracer("tasks-actions");

    return await tracer.startActiveSpan(
        "tasks.createTask",
        async (span) => {
            const eventStartTime = Date.now();

            try {
                // ✅ Inicia con atributos base
                recordStartEvent(span, "createTask", {
                    projectId,
                    taskStatus: status,
                    taskPriority: priority,
                    phaseCounter: taskCreationPhaseCounter,
                });
                // Internamente hace:
                // taskCreationPhaseCounter.add(1, {
                //     "phase": "started",
                //     "operation": "createTask",
                //     "task.status": "TODO",
                //     "task.priority": "MEDIUM",
                //     "project.id": projectId,
                // });

                const { data: task, errors } =
                    await cookieBasedClient.models.Task.create({
                        projectId,
                        title: title.trim(),
                        status,
                        priority,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    });

                if (errors) {
                    // ✅ Error con atributos
                    recordErrorEvent(span, "createTask", new Error(JSON.stringify(errors)), {
                        projectId,
                        taskStatus: status,
                        taskPriority: priority,
                        phaseCounter: taskCreationPhaseCounter,
                        errorType: "database",
                    });
                    // Internamente hace:
                    // taskCreationPhaseCounter.add(1, {
                    //     "phase": "error",
                    //     "operation": "createTask",
                    //     "task.status": "TODO",
                    //     "task.priority": "MEDIUM",
                    //     "project.id": projectId,
                    //     "error.type": "database",
                    //     "error.message": "...",
                    // });

                    span.end();
                    return { success: false, error: "Failed to create task" };
                }

                // ✅ Completado con atributos (incluyendo duración)
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
                // Internamente hace:
                // taskCreationPhaseCounter.add(1, {
                //     "phase": "completed",
                //     "operation": "createTask",
                //     "task.status": "TODO",
                //     "task.priority": "MEDIUM",
                //     "project.id": projectId,
                //     "task.id": "task-456",
                //     "processing_time_ms": "125",
                // });

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
                return { success: false, error: (error as Error).message };
            }
        }
    );
}

// ============================================================================
// TABLA: ATRIBUTOS DISPONIBLES EN CADA FASE
// ============================================================================

/*
FASE: STARTED
├─ "phase": "started"
├─ "operation": "createTask"
├─ "task.status": "TODO"
├─ "task.priority": "MEDIUM"
├─ "project.id": "proj-123"
└─ "task.id": "pending" (no existe aún)

FASE: COMPLETED
├─ "phase": "completed"
├─ "operation": "createTask"
├─ "task.status": "TODO"
├─ "task.priority": "MEDIUM"
├─ "project.id": "proj-123"
├─ "task.id": "task-456" (ya existe)
└─ "processing_time_ms": "125" ← NUEVO

FASE: ERROR
├─ "phase": "error" (database) o "exception" (runtime)
├─ "operation": "createTask"
├─ "task.status": "TODO"
├─ "task.priority": "MEDIUM"
├─ "project.id": "proj-123"
├─ "task.id": "pending"
├─ "error.type": "database" o "runtime" ← NUEVO
└─ "error.message": "Failed to create..." ← NUEVO
*/

// ============================================================================
// CONSULTAS EN PROMETHEUS/GRAFANA
// ============================================================================

/*
✅ Ver todas las fases de creación
tasks_creation_phase_total{phase="started"}
tasks_creation_phase_total{phase="completed"}
tasks_creation_phase_total{phase="error"}

✅ Ver creaciones exitosas por prioridad
tasks_creation_phase_total{phase="completed", task_priority="HIGH"}

✅ Ver errores por tipo
tasks_creation_phase_total{phase="error", error_type="database"}

✅ Ver por proyecto
tasks_creation_phase_total{phase="completed", project_id="proj-123"}

✅ Ver duración promedio
avg(tasks_creation_phase_total{phase="completed"})
*/