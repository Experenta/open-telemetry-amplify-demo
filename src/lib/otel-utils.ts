"use server";
import { trace } from "@opentelemetry/api";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";

/**
 * Forces a flush of all buffered traces.
 * Crucial for serverless environments (Lambda) where the process might freeze immediately after response.
 */
export async function flushTraces() {
	try {
		const provider = trace.getTracerProvider() as BasicTracerProvider;
		await provider.forceFlush();
	} catch (e) {
		console.error("Failed to flush traces", e);
	}
}
