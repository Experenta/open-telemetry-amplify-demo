# Project Management App - Setup Guide

A full-stack project management application built with Next.js 16, AWS Amplify Gen 2, and Shadcn UI. This application demonstrates SSR-first architecture with server actions, authentication, and real-time data management.

## Features

-   🔐 **Authentication**: Email/password authentication with AWS Cognito
-   📊 **Project Management**: Create and manage projects with status tracking
-   ✅ **Task Management**: Organize tasks with priorities, due dates, and subtasks
-   📈 **Analytics Dashboard**: Real-time productivity metrics and charts
-   🎨 **Modern UI**: Clean, accessible interface with Shadcn UI components
-   ⚡ **SSR-First**: Server-side rendering with Next.js App Router
-   🔄 **Server Actions**: Data mutations and fetching via Next.js server actions

## Architecture

### Tech Stack

-   **Frontend**: Next.js 16 (App Router), React 19, TypeScript
-   **Backend**: AWS Amplify Gen 2 (Cognito, DynamoDB)
-   **UI Components**: Shadcn UI, Radix UI, Tailwind CSS
-   **Charts**: Recharts
-   **Validation**: Zod
-   **Date Handling**: date-fns

### Key Patterns

1. **SSR-First Approach**: All data fetching happens on the server
2. **Server Actions**: Mutations are handled via Next.js server actions
3. **Cookie-Based Client**: Uses `generateServerClientUsingCookies` for data operations
4. **Server Context**: Amplify operations wrapped with `runWithAmplifyServerContext`

## Getting Started

### Prerequisites

-   Node.js 18+ and pnpm
-   AWS Account with appropriate permissions
-   AWS CLI configured with a profile (e.g., `Harvverse`)

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Start the Amplify sandbox:

```bash
pnpm sandbox
```

This will:

-   Deploy AWS resources (Cognito User Pool, DynamoDB tables)
-   Generate `amplify_outputs.json`
-   Stream function logs in development

3. In a separate terminal, start the Next.js dev server:

```bash
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── actions/              # Server actions
│   ├── auth.ts          # Authentication actions
│   ├── projects.ts      # Project CRUD operations
│   ├── tasks.ts         # Task CRUD operations
│   └── subtasks.ts      # Subtask CRUD operations
├── app/                 # Next.js App Router
│   ├── auth/           # Authentication pages
│   ├── projects/       # Project pages
│   ├── dashboard/      # Analytics dashboard
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home page
├── components/          # React components
│   ├── auth/           # Authentication forms
│   ├── dashboard/      # Dashboard charts
│   ├── layout/         # Layout components
│   ├── navigation/     # Navigation components
│   ├── projects/       # Project components
│   ├── subtasks/       # Subtask components
│   ├── tasks/          # Task components
│   └── ui/             # Shadcn UI components
└── utils/              # Utility functions
    ├── amplifyServerUtils.ts   # Server context wrapper
    └── amplifyDataClient.ts    # Cookie-based client

amplify/
├── auth/
│   └── resource.ts     # Cognito configuration
├── data/
│   └── resource.ts     # DynamoDB schema
└── backend.ts          # Backend definition
```

## Data Schema

### Project

-   name: string (required)
-   description: string
-   status: enum (ACTIVE, COMPLETED, ARCHIVED)
-   createdAt, updatedAt: datetime
-   tasks: hasMany relationship

### Task

-   title: string (required)
-   description: string
-   status: enum (TODO, IN_PROGRESS, COMPLETED)
-   priority: enum (LOW, MEDIUM, HIGH)
-   dueDate: datetime
-   projectId: id (required)
-   project: belongsTo relationship
-   subtasks: hasMany relationship

### Subtask

-   title: string (required)
-   isCompleted: boolean
-   taskId: id (required)
-   task: belongsTo relationship

## Authentication Flow

1. User signs up with email/password (client-side using `aws-amplify/auth`)
2. Receives confirmation code via email
3. Confirms account with code (client-side using `aws-amplify/auth`)
4. Signs in and gets authenticated session (client-side using `aws-amplify/auth`)
5. Server-side pages check authentication using `getCurrentUser` from `aws-amplify/auth/server`
6. All data operations are scoped to authenticated user (owner authorization)

**Important:** Authentication operations (`signUp`, `signIn`, `signOut`, `confirmSignUp`) are **client-side only** and must be called from client components. Only `getCurrentUser`, `fetchAuthSession`, and `fetchUserAttributes` are available server-side.

## Server Actions Pattern

All data operations follow this pattern:

```typescript
"use server";

import { cookieBasedClient } from "@/utils/amplifyDataClient";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
	const name = formData.get("name") as string;

	const { data, errors } = await cookieBasedClient.models.Project.create({
		name,
		// ... other fields
	});

	if (errors) {
		return { success: false, error: "Failed to create project" };
	}

	revalidatePath("/projects");
	return { success: true, project: data };
}
```

## Dashboard Metrics

The dashboard provides:

1. **Stats Cards**: Active projects, total tasks, completion rate, productivity index
2. **Task Status Chart**: Pie chart showing task distribution
3. **Project Progress**: Bar chart of project statuses
4. **Productivity Trend**: 7-day line chart of task creation/completion

## OpenTelemetry Integration Points

This application is designed to be instrumented with OpenTelemetry. Key areas to instrument:

1. **Server Actions**: All actions in `src/actions/`
2. **Data Operations**: Cookie-based client calls
3. **Authentication**: Sign-up, sign-in, sign-out flows
4. **Page Loads**: SSR data fetching
5. **API Calls**: Amplify Data API operations

## Development Tips

### Hot Reload

-   Changes to components and pages hot reload automatically
-   Changes to server actions require page refresh
-   Changes to Amplify schema require redeploying sandbox

### Debugging

-   Server actions logs appear in terminal running `pnpm dev`
-   Amplify logs appear in terminal running `pnpm sandbox`
-   Use browser DevTools for client-side debugging

### Testing Authentication

-   Use temporary email for testing
-   Confirmation codes appear in CloudWatch (via sandbox logs)
-   Can also check AWS Cognito console

## Common Issues

### "User not authenticated"

-   Ensure you're signed in
-   Check cookie is being set correctly
-   Verify Amplify configuration in client

### "Cannot read properties of null"

-   Check data exists before accessing
-   Use optional chaining (`?.`)
-   Handle loading and error states

### Schema Changes Not Reflecting

-   Restart Amplify sandbox
-   Clear Next.js cache: `rm -rf .next`
-   Restart dev server

## Production Deployment

1. Deploy Amplify backend:

```bash
npx ampx pipeline-deploy --branch main --app-id <your-app-id>
```

2. Deploy Next.js to Vercel/AWS:

```bash
pnpm build
```

3. Set environment variables in deployment platform

## Additional Resources

-   [AWS Amplify Gen 2 Docs](https://docs.amplify.aws/)
-   [Next.js 16 Docs](https://nextjs.org/docs)
-   [Shadcn UI](https://ui.shadcn.com/)
-   [Recharts](https://recharts.org/)

## License

MIT
