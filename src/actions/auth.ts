"use server";

import { getCurrentUser } from "aws-amplify/auth/server";
import { runWithAmplifyServerContext } from "@/utils/amplifyServerUtils";
import { cookies } from "next/headers";

/**
 * Server action to get the current authenticated user
 * Note: signUp, signIn, signOut, and confirmSignUp are client-side only
 * and must be called from client components using aws-amplify/auth
 */
export async function getCurrentUserAction() {
  try {
    const user = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: (contextSpec) => getCurrentUser(contextSpec),
    });

    return { user, isAuthenticated: true };
  } catch (error: unknown) {
    return {
      user: null,
      isAuthenticated: false,
      error: (error as Error).message || "Failed to get current user",
    };
  }
}
