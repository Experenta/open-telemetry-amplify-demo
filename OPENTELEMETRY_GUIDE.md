# OpenTelemetry Instrumentation Guide

This guide provides detailed instructions for instrumenting this Next.js 16 + AWS Amplify application with OpenTelemetry for distributed tracing and observability.

## Overview

This application is built with:

-   **Next.js 16** with App Router and Server Actions
-   **AWS Amplify Gen 2** for authentication and data
-   **Server-Side Rendering (SSR)** first approach
-   **Cookie-based authentication** with Cognito

## Key Instrumentation Points

### 1. Server Actions (Primary Focus)

All data operations use server actions located in `src/actions/`:

#### Authentication Actions (`src/actions/auth.ts`)

-   `getCurrentUserAction` - Server-side session check

**Note:** Authentication operations (`signUp`, `signIn`, `signOut`, `confirmSignUp`) are **client-side only** and located in:

-   `src/components/auth/SignUpForm.tsx` - User registration
-   `src/components/auth/ConfirmSignUpForm.tsx` - Email verification
-   `src/components/auth/SignInForm.tsx` - User login
-   `src/components/auth/SignOutButton.tsx` - User logout

#### Project Actions (`src/actions/projects.ts`)

-   `getProjects` - List all projects
-   `getProjectById` - Get single project
-   `createProject` - Create new project
-   `updateProject` - Update project
-   `deleteProject` - Delete project

#### Task Actions (`src/actions/tasks.ts`)

-   `getTasksByProjectId` - List tasks for project
-   `getTaskById` - Get single task
-   `createTask` - Create new task
-   `updateTask` - Update task
-   `deleteTask` - Delete task
-   `getAllTasks` - List all user's tasks

#### Subtask Actions (`src/actions/subtasks.ts`)

-   `getSubtasksByTaskId` - List subtasks for task
-   `createSubtask` - Create new subtask
-   `updateSubtask` - Update subtask
-   `toggleSubtask` - Toggle completion status
-   `deleteSubtask` - Delete subtask
-   `getAllSubtasks` - List all user's subtasks

### 2. Data Client Operations

All data operations use `cookieBasedClient` from `src/utils/amplifyDataClient.ts`:

```typescript
import { generateServerClientUsingCookies } from "@aws-amplify/adapter-nextjs/data";
import { cookies } from "next/headers";
import outputs from "@/amplify_outputs.json";
import type { Schema } from "@/amplify/data/resource";

export const cookieBasedClient = generateServerClientUsingCookies<Schema>({
	config: outputs,
	cookies,
});
```

**Operations to instrument:**

-   `models.Project.create()`
-   `models.Project.list()`
-   `models.Project.get()`
-   `models.Project.update()`
-   `models.Project.delete()`
-   Same for Task and Subtask models

### 3. Server Context Operations

Server-side authentication check uses `runWithAmplifyServerContext` from `src/utils/amplifyServerUtils.ts`:

```typescript
import { createServerRunner } from "@aws-amplify/adapter-nextjs";
import outputs from "@/amplify_outputs.json";

export const { runWithAmplifyServerContext } = createServerRunner({
	config: outputs,
});
```

**Server-side operations to instrument:**

-   `getCurrentUser` - Session validation (server-side)
-   `fetchAuthSession` - Get session details (server-side)
-   `fetchUserAttributes` - Get user attributes (server-side)

**Client-side operations to instrument:**

-   `signUp` - User registration (client-side in `SignUpForm.tsx`)
-   `signIn` - User authentication (client-side in `SignInForm.tsx`)
-   `signOut` - User logout (client-side in `SignOutButton.tsx`)
-   `confirmSignUp` - Email verification (client-side in `ConfirmSignUpForm.tsx`)

### 4. Page Server Components

All pages perform SSR data fetching:

#### Projects List (`src/app/projects/page.tsx`)

```typescript
const { projects } = await getProjects();
```

#### Project Detail (`src/app/projects/[id]/page.tsx`)

```typescript
const { project } = await getProjectById(params.id);
const { tasks } = await getTasksByProjectId(params.id);
```

#### Dashboard (`src/app/dashboard/page.tsx`)

```typescript
const [projectsResult, tasksResult, subtasksResult] = await Promise.all([
	getProjects(),
	getAllTasks(),
	getAllSubtasks(),
]);
```

## Instrumentation Strategy

### Approach 1: Wrap Server Actions

Create a wrapper utility for tracing server actions:

```typescript
// src/utils/telemetry.ts
import { trace, context } from "@opentelemetry/api";

export function traceServerAction<T extends (...args: any[]) => Promise<any>>(
	name: string,
	action: T
): T {
	return (async (...args: Parameters<T>) => {
		const tracer = trace.getTracer("nextjs-server-actions");
		return await tracer.startActiveSpan(name, async (span) => {
			try {
				const result = await action(...args);
				span.setStatus({ code: 1 }); // OK
				return result;
			} catch (error) {
				span.setStatus({
					code: 2, // ERROR
					message:
						error instanceof Error
							? error.message
							: "Unknown error",
				});
				span.recordException(error as Error);
				throw error;
			} finally {
				span.end();
			}
		});
	}) as T;
}
```

**Usage:**

```typescript
export const createProject = traceServerAction(
	"projects.create",
	async (formData: FormData) => {
		// ... implementation
	}
);
```

### Approach 2: Wrap Data Client

Create a traced wrapper for the Amplify data client:

```typescript
// src/utils/tracedDataClient.ts
import { cookieBasedClient } from "./amplifyDataClient";
import { trace } from "@opentelemetry/api";

export function createTracedClient() {
	const tracer = trace.getTracer("amplify-data-client");

	return new Proxy(cookieBasedClient, {
		get(target, prop) {
			const value = target[prop];
			if (prop === "models") {
				return new Proxy(value, {
					get(modelsTarget, modelName) {
						const model = modelsTarget[modelName];
						return new Proxy(model, {
							get(modelTarget, operation) {
								const originalMethod = modelTarget[operation];
								if (typeof originalMethod === "function") {
									return async (...args: any[]) => {
										return tracer.startActiveSpan(
											`amplify.${modelName}.${String(
												operation
											)}`,
											async (span) => {
												try {
													const result =
														await originalMethod.apply(
															modelTarget,
															args
														);
													span.setAttribute(
														"model",
														String(modelName)
													);
													span.setAttribute(
														"operation",
														String(operation)
													);
													if (result.errors) {
														span.setStatus({
															code: 2,
															message:
																"GraphQL errors",
														});
													}
													return result;
												} catch (error) {
													span.recordException(
														error as Error
													);
													throw error;
												} finally {
													span.end();
												}
											}
										);
									};
								}
								return originalMethod;
							},
						});
					},
				});
			}
			return value;
		},
	});
}
```

### Approach 3: Automatic Instrumentation

Use Next.js instrumentation hook:

```typescript
// src/instrumentation.ts
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { NodeSDK } = await import("@opentelemetry/sdk-node");
		const { getNodeAutoInstrumentations } = await import(
			"@opentelemetry/auto-instrumentations-node"
		);
		const { OTLPTraceExporter } = await import(
			"@opentelemetry/exporter-trace-otlp-http"
		);

		const sdk = new NodeSDK({
			traceExporter: new OTLPTraceExporter({
				url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
			}),
			instrumentations: [
				getNodeAutoInstrumentations({
					"@opentelemetry/instrumentation-fs": {
						enabled: false,
					},
				}),
			],
		});

		sdk.start();
	}
}
```

Enable in `next.config.ts`:

```typescript
const nextConfig = {
	experimental: {
		instrumentationHook: true,
	},
};
```

## Span Attributes to Capture

### For Server Actions

-   `action.name` - Name of the action
-   `action.type` - Type (create, read, update, delete)
-   `user.id` - Authenticated user ID (if available)
-   `resource.type` - Resource type (project, task, subtask)
-   `resource.id` - Resource ID (for single resource operations)

### For Data Operations

-   `db.system` - "dynamodb"
-   `db.operation` - Operation type (create, list, get, update, delete)
-   `db.model` - Model name (Project, Task, Subtask)
-   `db.aws.table_name` - DynamoDB table name

### For Authentication

-   `auth.provider` - "cognito"
-   `auth.operation` - Operation (signup, signin, signout, confirm)
-   `user.email` - User email (avoid PII in production)

### For Pages

-   `http.route` - Page route
-   `http.method` - Request method
-   `next.page` - Page component name
-   `next.route` - Dynamic route

## Metrics to Collect

### Operation Metrics

-   `server_action.duration` - Time taken for server action
-   `server_action.success` - Success count
-   `server_action.error` - Error count

### Data Metrics

-   `amplify.operation.duration` - Time for data operations
-   `amplify.operation.errors` - Error count per model/operation

### Authentication Metrics

-   `auth.signin.duration` - Login duration
-   `auth.signup.duration` - Registration duration
-   `auth.session.duration` - Session lifetime

### Business Metrics

-   `projects.created` - Number of projects created
-   `tasks.created` - Number of tasks created
-   `tasks.completed` - Number of tasks completed
-   `productivity.index` - User productivity score

## Error Tracking

### Error Types to Track

1. **Authentication Errors**

    - Invalid credentials
    - Unconfirmed account
    - Expired session

2. **Authorization Errors**

    - Access denied to resource
    - Invalid owner

3. **Validation Errors**

    - Missing required fields
    - Invalid data format

4. **Data Errors**
    - DynamoDB errors
    - GraphQL errors
    - Network timeouts

### Error Context

For each error, capture:

-   Error type/code
-   Error message
-   Stack trace
-   User context
-   Request context
-   Resource context

## Example: Full Instrumentation

### Instrumented Server Action

```typescript
"use server";

import { trace, context } from "@opentelemetry/api";
import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
	const tracer = trace.getTracer("project-actions");

	return await tracer.startActiveSpan("projects.create", async (span) => {
		try {
			const name = formData.get("name") as string;
			const description = formData.get("description") as string;

			span.setAttribute("resource.type", "project");
			span.setAttribute("project.name", name);

			const { data: project, errors } =
				await cookieBasedClient.models.Project.create({
					name: name.trim(),
					description: description?.trim() || null,
					status: "ACTIVE",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

			if (errors) {
				span.setStatus({
					code: 2,
					message: "Failed to create project",
				});
				span.recordException(new Error(JSON.stringify(errors)));
				return { success: false, error: "Failed to create project" };
			}

			span.setAttribute("resource.id", project.id);
			span.setStatus({ code: 1 }); // OK

			revalidatePath("/projects");
			return { success: true, project };
		} catch (error: any) {
			span.setStatus({ code: 2, message: error.message });
			span.recordException(error);
			return {
				success: false,
				error: error.message || "Failed to create project",
			};
		} finally {
			span.end();
		}
	});
}
```

## Testing Instrumentation

### Local Testing

1. Run Jaeger locally:

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

2. Set environment variable:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

3. View traces at http://localhost:16686

### Sample Trace Flow

Creating a project with tasks:

```
1. User submits form (client)
2. createProject server action starts
   - Span: projects.create
3. cookieBasedClient.models.Project.create()
   - Span: amplify.Project.create
   - Child: DynamoDB PutItem
4. revalidatePath('/projects')
5. Response returned to client
6. Client redirects to project page
7. getProjectById server action
   - Span: projects.get
8. getTasksByProjectId server action
   - Span: tasks.list
```

## Performance Targets

Set alerts for:

-   Server action duration > 1000ms
-   Data operation duration > 500ms
-   Authentication duration > 2000ms
-   Page load time > 3000ms
-   Error rate > 1%

## Privacy Considerations

**DO NOT** include in traces:

-   Passwords
-   Auth tokens
-   PII beyond user ID
-   Sensitive project/task content

**DO** include:

-   User ID (anonymized if needed)
-   Resource IDs
-   Operation types
-   Timing data
-   Error codes (not messages with PII)

## Next Steps

1. Choose instrumentation approach
2. Implement tracing in key server actions
3. Add metrics collection
4. Set up trace visualization
5. Configure alerts
6. Monitor and optimize

## Resources

-   [OpenTelemetry JS Documentation](https://opentelemetry.io/docs/js/)
-   [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
-   [AWS Amplify Observability](https://docs.amplify.aws/)
