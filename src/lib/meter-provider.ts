// lib/meter-provider.ts
/*import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { Resource, resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const resource = resourceFromAttributes({
	[ATTR_SERVICE_NAME]: "telemetry-example",
});

const metricExporter = new OTLPMetricExporter({
	url: "http://localhost:4318/v1/metrics",
});

export const meterProvider = new MeterProvider({
	resource,
	readers: [
		new PeriodicExportingMetricReader({
			exporter: metricExporter,
		}),
	],
});*/

// lib/meter-provider.ts
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader, MeterProvider } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes, Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const resource: Resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: "telemetry-example",
});

// Exportador de métricas
const metricExporter = new OTLPMetricExporter({
  url: "http://localhost:4318/v1/metrics", // Cambia si es otro endpoint
});

// Protección contra doble inicialización
if (!(globalThis as any).__meterProvider) {
  console.log("[otel] Inicializando MeterProvider...");

  const meterProvider = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: metricExporter })],
  });

  (globalThis as any).__meterProvider = meterProvider;
}

export const meterProvider: MeterProvider = (globalThis as any).__meterProvider;




