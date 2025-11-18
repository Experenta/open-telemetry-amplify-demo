/*import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
// Add otel logging
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR); // set diaglog level to DEBUG when debugging

export async function register() {
	registerOTel({
		serviceName: "telemetry-example",
		traceExporter: new OTLPHttpJsonTraceExporter({
			url: "http://localhost:4318/v1/traces",
		}),
	});

	await import ("./lib/otel-logs");
}*/


// instrumentation.ts
/*import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
import { metrics } from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

export async function register() {
	// Registrar el MeterProvider ANTES de registerOTel
	metrics.setGlobalMeterProvider(meterProvider);

	// Registrar traces
	registerOTel({
		serviceName: "telemetry-example",
		traceExporter: new OTLPHttpJsonTraceExporter({
			url: "http://localhost:4318/v1/traces",
		}),
	});

	await import("./lib/otel-logs");
}*/

// instrumentation.ts
import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
import { metrics } from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

// Logs de diagnóstico
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

export async function register() {
  // Registrar métricas solo en producción
  if (process.env.NODE_ENV === "production") {
    console.log("[otel] Registrando métricas...");
    metrics.setGlobalMeterProvider(meterProvider);
  } else {
    console.log("[otel] Métricas deshabilitadas en modo dev");
  }

  // Registrar traces siempre (funciona en dev y prod)
  registerOTel({
    serviceName: "telemetry-example",
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: "http://localhost:4318/v1/traces",
    }),
  });

  // Carga opcional de logs OTel
  await import("./lib/otel-logs");
}