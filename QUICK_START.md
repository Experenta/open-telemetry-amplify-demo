# Quick Start Guide

## Prerequisites

-   Node.js 18+
-   pnpm installed
-   AWS CLI configured with your profile

## Get Started in 3 Steps

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Amplify Sandbox

In one terminal:

```bash
pnpm sandbox
```

Wait for "Watching for file changes..." message. This deploys AWS resources.

### 3. Start Next.js Dev Server

In another terminal:

```bash
pnpm dev
```

### 4. Open Application

Visit http://localhost:3000

## First Time Setup

1. **Sign Up**: Click "Sign up" and create an account
2. **Check Email**: Look for confirmation code (or check sandbox logs)
3. **Confirm**: Enter the code on the confirmation page
4. **Sign In**: Log in with your credentials
5. **Create Project**: Click "New Project" on the projects page
6. **Add Tasks**: Open a project and add tasks
7. **Add Subtasks**: Expand a task and add subtasks
8. **View Dashboard**: Check the Dashboard for analytics

## Project Structure Overview

```
src/
├── actions/          # Server actions (all data operations)
├── app/             # Pages and routes
├── components/      # React components
└── utils/           # Amplify utilities

amplify/
├── auth/            # Cognito auth configuration
├── data/            # DynamoDB schema
└── backend.ts       # Backend definition
```

## Key Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm sandbox          # Start Amplify sandbox

# Build
pnpm build            # Production build
pnpm start            # Start production server

# Linting
pnpm lint             # Run ESLint
```

## Key Files to Know

-   `amplify/data/resource.ts` - Database schema
-   `src/actions/` - All server actions
-   `src/utils/amplifyDataClient.ts` - Data client setup
-   `amplify_outputs.json` - Generated config (don't edit)

## Common Workflows

### Add New Model to Schema

1. Edit `amplify/data/resource.ts`
2. Wait for sandbox to redeploy
3. Create server actions for the model
4. Create UI components

### Add New Server Action

1. Create function in appropriate file in `src/actions/`
2. Mark with `'use server'`
3. Use `cookieBasedClient` for data operations
4. Call `revalidatePath()` after mutations
5. Import and use in components

### Add New Page

1. Create file in `src/app/`
2. Wrap with `<MainLayout>`
3. Check authentication with `getCurrentUserAction()`
4. Fetch data with server actions
5. Pass data to client components

## Troubleshooting

### "User not authenticated"

-   Sign out and sign in again
-   Check if cookies are enabled

### Schema changes not working

```bash
# Kill sandbox (Ctrl+C) and restart
pnpm sandbox
```

### Port already in use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Clear build cache

```bash
rm -rf .next
pnpm dev
```

## Next Steps

-   Review `PROJECT_SETUP.md` for detailed documentation
-   Review `OPENTELEMETRY_GUIDE.md` for instrumentation
-   Explore the codebase starting with pages in `src/app/`
-   Check out server actions in `src/actions/`

## Support

For issues:

1. Check sandbox logs (terminal running `pnpm sandbox`)
2. Check dev server logs (terminal running `pnpm dev`)
3. Check browser console
4. Review AWS Amplify docs: https://docs.amplify.aws/

## Production Deployment

See `PROJECT_SETUP.md` for production deployment instructions.
