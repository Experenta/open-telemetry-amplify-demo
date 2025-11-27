//EMPEZAR A HACER LA CONFIGURACION DEL LOGGER
import { trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import {
    LoggerProvider,
    BatchLogRecordProcessor,
    ConsoleLogRecordExporter,
} from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

let loggerProvider: LoggerProvider | null = null;

//Configuracion del Logger Provider
const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "open-telemetry-amplify-demo",
    [ATTR_SERVICE_VERSION]: "1.0.0",
});

const logExporter = new OTLPLogExporter({
    //url: "http://localhost:4318/v1/logs",
    url: "https://signoz.digexperenta.com/v1/traces",
    headers: {},
});

loggerProvider = new LoggerProvider({
    resource: resource,
    logRecordLimits: {
        attributeCountLimit: 128,
        attributeValueLengthLimit: Infinity
    },
    processors: [
        new BatchLogRecordProcessor(logExporter, {
            maxExportBatchSize: 10,
            scheduledDelayMillis: 5000, // Export every 5 seconds
            exportTimeoutMillis: 30000,
            maxQueueSize: 100,
        })
    ]
})

logs.setGlobalLoggerProvider(loggerProvider);

export { loggerProvider };