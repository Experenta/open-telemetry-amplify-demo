# Authentication Guide

## Important: Client vs Server Authentication

AWS Amplify authentication has **strict separation** between client-side and server-side operations.

## Client-Side Only Operations

These functions are available **only** in client components using `aws-amplify/auth`:

### Available Functions

-   `signUp()` - User registration
-   `signIn()` - User login
-   `signOut()` - User logout
-   `confirmSignUp()` - Email verification
-   `resendSignUpCode()` - Resend confirmation code
-   `resetPassword()` - Password reset
-   `confirmResetPassword()` - Confirm password reset

### Implementation Location

-   `src/components/auth/SignUpForm.tsx` - Sign up with email/password
-   `src/components/auth/SignInForm.tsx` - Sign in
-   `src/components/auth/SignOutButton.tsx` - Sign out
-   `src/components/auth/ConfirmSignUpForm.tsx` - Confirm email

### Example: Sign Up (Client Component)

```typescript
"use client";

import { signUp } from "aws-amplify/auth";

export function SignUpForm() {
	async function handleSignUp(email: string, password: string, name: string) {
		try {
			await signUp({
				username: email,
				password,
				options: {
					userAttributes: {
						email,
						name,
					},
				},
			});
			// Success - redirect to confirmation
		} catch (error) {
			// Handle error
		}
	}
}
```

## Server-Side Only Operations

These functions are available **only** on the server using `aws-amplify/auth/server`:

### Available Functions

-   `getCurrentUser()` - Get current authenticated user
-   `fetchAuthSession()` - Get session details
-   `fetchUserAttributes()` - Get user attributes

### Implementation Location

-   `src/actions/auth.ts` - Server action for getting current user
-   `src/utils/amplifyServerUtils.ts` - Server context wrapper

### Example: Get Current User (Server Action)

```typescript
"use server";

import { getCurrentUser } from "aws-amplify/auth/server";
import { runWithAmplifyServerContext } from "@/utils/amplifyServerUtils";
import { cookies } from "next/headers";

export async function getCurrentUserAction() {
	try {
		const user = await runWithAmplifyServerContext({
			nextServerContext: { cookies },
			operation: (contextSpec) => getCurrentUser(contextSpec),
		});

		return { user, isAuthenticated: true };
	} catch (error) {
		return { user: null, isAuthenticated: false };
	}
}
```

## Complete Authentication Flow

### 1. Sign Up (Client-Side)

```typescript
// src/components/auth/SignUpForm.tsx
"use client";

import { signUp } from "aws-amplify/auth";

async function handleSignUp(email, password, name) {
	await signUp({
		username: email,
		password,
		options: {
			userAttributes: { email, name },
		},
	});
	// Redirect to confirmation page
}
```

### 2. Confirm Sign Up (Client-Side)

```typescript
// src/components/auth/ConfirmSignUpForm.tsx
"use client";

import { confirmSignUp } from "aws-amplify/auth";

async function handleConfirm(email, code) {
	await confirmSignUp({
		username: email,
		confirmationCode: code,
	});
	// Redirect to sign in
}
```

### 3. Sign In (Client-Side)

```typescript
// src/components/auth/SignInForm.tsx
"use client";

import { signIn } from "aws-amplify/auth";

async function handleSignIn(email, password) {
	await signIn({
		username: email,
		password,
	});
	// Redirect to protected page
	router.push("/projects");
	router.refresh(); // Refresh to update server-side auth state
}
```

### 4. Check Authentication (Server-Side)

```typescript
// src/app/projects/page.tsx (Server Component)
import { getCurrentUserAction } from "@/actions/auth";
import { redirect } from "next/navigation";

export default async function ProjectsPage() {
	const { isAuthenticated } = await getCurrentUserAction();

	if (!isAuthenticated) {
		redirect("/auth/sign-in");
	}

	// Render protected content
}
```

### 5. Sign Out (Client-Side)

```typescript
// src/components/auth/SignOutButton.tsx
"use client";

import { signOut } from "aws-amplify/auth";

async function handleSignOut() {
	await signOut();
	router.push("/auth/sign-in");
	router.refresh(); // Refresh to update server-side auth state
}
```

## Why This Separation?

### Client-Side Operations

-   Require user interaction (entering credentials)
-   Use browser APIs for secure credential handling
-   Manage session tokens in browser storage
-   Handle OAuth flows and redirects

### Server-Side Operations

-   Read session from cookies (set by client)
-   Validate authentication for SSR pages
-   Check permissions for server actions
-   Access user data for data fetching

## Common Mistakes to Avoid

### ❌ Don't: Call signIn from Server Action

```typescript
"use server";

import { signIn } from "aws-amplify/auth/server"; // ❌ Doesn't exist!

export async function signInAction(email, password) {
	await signIn({ username: email, password }); // ❌ Error!
}
```

### ✅ Do: Call signIn from Client Component

```typescript
"use client";

import { signIn } from "aws-amplify/auth"; // ✅ Correct import

export function SignInForm() {
	async function handleSubmit(email, password) {
		await signIn({ username: email, password }); // ✅ Works!
	}
}
```

### ❌ Don't: Call getCurrentUser from Client Component

```typescript
"use client";

import { getCurrentUser } from "aws-amplify/auth/server"; // ❌ Server-only!

export function UserProfile() {
	const user = await getCurrentUser(); // ❌ Error!
}
```

### ✅ Do: Call getCurrentUser from Server Component/Action

```typescript
// Server Component
import { getCurrentUserAction } from "@/actions/auth";

export default async function Page() {
	const { user } = await getCurrentUserAction(); // ✅ Works!
}
```

## Available Server-Side Auth APIs

According to AWS Amplify documentation, these are the **only** auth functions available server-side:

| Function              | Purpose             | Available in Server Runtime |
| --------------------- | ------------------- | --------------------------- |
| `getCurrentUser`      | Get current user    | ✅ Yes                      |
| `fetchAuthSession`    | Get session details | ✅ Yes                      |
| `fetchUserAttributes` | Get user attributes | ✅ Yes                      |
| `signUp`              | User registration   | ❌ No (client-only)         |
| `signIn`              | User login          | ❌ No (client-only)         |
| `signOut`             | User logout         | ❌ No (client-only)         |
| `confirmSignUp`       | Email verification  | ❌ No (client-only)         |

## Session Management

### How Sessions Work

1. **Client signs in** → Amplify stores tokens in browser
2. **Amplify sets cookies** → Secure, httpOnly cookies
3. **Server reads cookies** → Via `getCurrentUser` with cookies context
4. **Server validates session** → Returns user or error

### Cookie-Based Authentication

```typescript
// src/utils/amplifyServerUtils.ts
import { createServerRunner } from "@aws-amplify/adapter-nextjs";
import outputs from "@/amplify_outputs.json";

export const { runWithAmplifyServerContext } = createServerRunner({
	config: outputs,
});

// Usage in server action
import { cookies } from "next/headers";

const user = await runWithAmplifyServerContext({
	nextServerContext: { cookies },
	operation: (contextSpec) => getCurrentUser(contextSpec),
});
```

## Testing Authentication

### Test Sign Up Flow

1. Navigate to `/auth/sign-up`
2. Enter email, password, name
3. Submit form (client-side `signUp` called)
4. Check email for confirmation code
5. Navigate to `/auth/confirm`
6. Enter code (client-side `confirmSignUp` called)

### Test Sign In Flow

1. Navigate to `/auth/sign-in`
2. Enter email, password
3. Submit form (client-side `signIn` called)
4. Redirected to `/projects`
5. Server checks auth with `getCurrentUser`

### Test Protected Routes

1. Try accessing `/projects` without auth
2. Server calls `getCurrentUserAction`
3. Returns `isAuthenticated: false`
4. Redirects to `/auth/sign-in`

## Troubleshooting

### "User not authenticated" on server

-   Ensure client called `router.refresh()` after sign in
-   Check cookies are being set (browser DevTools)
-   Verify Amplify configuration is correct

### "signIn is not a function" error

-   Check you're importing from correct package:
    -   Client: `aws-amplify/auth`
    -   Server: `aws-amplify/auth/server`

### Session not persisting

-   Ensure `Amplify.configure()` is called with `{ ssr: true }`
-   Check cookies are not being blocked
-   Verify domain/CORS settings

## Summary

✅ **Client-Side Auth**: `signUp`, `signIn`, `signOut`, `confirmSignUp`  
✅ **Server-Side Auth**: `getCurrentUser`, `fetchAuthSession`, `fetchUserAttributes`  
✅ **Session**: Managed via secure cookies  
✅ **Protection**: Check auth in server components with `getCurrentUserAction`

This separation ensures secure authentication while maintaining the benefits of SSR and server actions.
