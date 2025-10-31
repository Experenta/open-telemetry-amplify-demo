import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
// Add otel logging
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR); // set diaglog level to DEBUG when debugging

export function register() {
	registerOTel({
		serviceName: "telemetry-example",
		traceExporter: new OTLPHttpJsonTraceExporter({
			url: "http://localhost:4318/v1/traces",
		}),
	});
}
