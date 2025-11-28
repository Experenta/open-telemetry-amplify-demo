import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider";

// Logs de diagnóstico
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

export async function register() {
	metrics.setGlobalMeterProvider(meterProvider);

	// Registrar traces siempre (funciona en dev y prod)
	registerOTel({
		serviceName: "telemetry-example",
		traceExporter: new OTLPHttpJsonTraceExporter({
			//url: "http://localhost:4318/v1/traces",
			url: "https://signoz.digexperenta.com/v1/traces",
		}),
	});
}
