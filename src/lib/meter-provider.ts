// lib/meter-provider.ts
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import {
	PeriodicExportingMetricReader,
	MeterProvider,
} from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes, Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Extend globalThis with proper typing
declare global {
	var __meterProvider: MeterProvider | undefined;
}

const resource: Resource = resourceFromAttributes({
	[ATTR_SERVICE_NAME]: "telemetry-example",
});

// Exportador de métricas
const metricExporter = new OTLPMetricExporter({
	//url: "http://localhost:4318/v1/metrics", // Cambia si es otro endpoint
	url: "https://signoz.digexperenta.com/v1/metrics",
});

// Protección contra doble inicialización
if (!globalThis.__meterProvider) {
	console.log("[otel] Inicializando MeterProvider...");

	const meterProvider = new MeterProvider({
		resource,
		readers: [
			new PeriodicExportingMetricReader({ exporter: metricExporter }),
		],
	});

	globalThis.__meterProvider = meterProvider;
}

export const meterProvider: MeterProvider =
	globalThis.__meterProvider as MeterProvider;
