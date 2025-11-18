"use server";

import { getCurrentUser } from "aws-amplify/auth/server";
import { runWithAmplifyServerContext } from "@/utils/amplifyServerUtils";
import { cookies } from "next/headers";
import { trace } from "@opentelemetry/api";

/**
 * Server action to get the current authenticated user
 * Note: signUp, signIn, signOut, and confirmSignUp are client-side only
 * and must be called from client components using aws-amplify/auth
 */
export async function getCurrentUserAction() {

  // Usamos "auth-actions" para identificar que son operaciones de autenticación
  const tracer = trace.getTracer("auth-actions");

  // "auth.getCurrentUser" es el nombre que verás en SigNoz
  return await tracer.startActiveSpan("auth.getCurrentUser",
    async (span) => {
      try {

        span.setAttribute("action.name", "getCurrentUser");
				span.setAttribute("action.type", "read"); // Tipo de operación: lectura
				span.setAttribute("resource.type", "user"); // Recurso afectado: usuario
				span.setAttribute("auth.operation", "get_current_user");

        //Comienzo de la operacion
        span.addEvent("auth.getCurrentUser.started");

        const user = await runWithAmplifyServerContext({
          nextServerContext: { cookies },
          operation: (contextSpec) => getCurrentUser(contextSpec),
        });

        //Atributos de usuario encontrado
        span.setAttribute("auth.user.found", true);
				span.setAttribute("auth.user.id", user.userId || "unknown");
				span.setAttribute("auth.user.username", user.username || "unknown");

        span.addEvent("auth.getCurrentUser.success", {
					userId: user.userId || "unknown",
					username: user.username || "unknown",
				});
        span.setStatus({ code: 1 });
        span.end();

        return { user, isAuthenticated: true };
      } catch (error: unknown) {

        span.setStatus({
					code: 2, // ERROR
					message: error instanceof Error ? error.message : "Unknown error",
				});
        span.recordException(error as Error);
        span.setAttribute("auth.user.found", false);
				span.setAttribute("error.type", error instanceof Error ? error.constructor.name : "unknown");
        span.addEvent("auth.getCurrentUser.error", {
					error: error instanceof Error ? error.message : "Unknown error",
					errorType: error instanceof Error ? error.constructor.name : "unknown",
				});
        span.end();

        return {
          user: null,
          isAuthenticated: false,
          error: (error as Error).message || "Failed to get current user",
        };
      }
    }
  )
}
