"use server";

import { metrics } from "@opentelemetry/api";
import { meterProvider } from "@/lib/meter-provider";

const meter = metrics.getMeter("demo-metrics");

// 1. COUNTER
const apiCallCounter = meter.createCounter("api_calls_total", {
	description: "Total de llamadas API",
	unit: "calls",
});

const errorCounter = meter.createCounter("errors_total", {
	description: "Total de errores",
	unit: "errors",
});

// 2. HISTOGRAM
const operationDuration = meter.createHistogram("operation_duration_ms", {
	description: "Duración de operaciones en milisegundos",
	unit: "ms",
});

const dataSize = meter.createHistogram("data_size_bytes", {
	description: "Tamaño de datos procesados",
	unit: "bytes",
});

// 2.1 HISTOGRAMAS DE LATENCIA - EXACTO PATRÓN tasks-actions.ts
const apiCallLatency = meter.createHistogram("api_call_latency_ms", {
	description: "Latencia específica de llamadas API",
	unit: "ms",
});

const dataProcessingLatency = meter.createHistogram("data_processing_latency_ms", {
	description: "Latencia específica de procesamiento de datos",
	unit: "ms",
});

const complexOperationLatency = meter.createHistogram("complex_operation_latency_ms", {
	description: "Latencia específica de operaciones complejas",
	unit: "ms",
});

// 3. UPDOWNCOUNTER
const activeUsers = meter.createUpDownCounter("active_users", {
	description: "Usuarios activos en el sistema",
	unit: "users",
});

const cartItems = meter.createUpDownCounter("cart_items", {
	description: "Items en el carrito",
	unit: "items",
});

async function randomDelay(min: number = 100, max: number = 2000) {
	const delay = Math.floor(Math.random() * (max - min + 1)) + min;
	await new Promise((resolve) => setTimeout(resolve, delay));
	return delay;
}

// DEMO 1: Simular llamada API
export async function simulateApiCall() {
	const totalStartTime = Date.now();
	let apiDuration = 0;

	try {
		// ✅ MEDIR SOLO LA LLAMADA A LA API
		const apiCallStartTime = Date.now();
		await randomDelay(100, 1500);
		apiDuration = Date.now() - apiCallStartTime;

		if (Math.random() < 0.2) {
			throw new Error("API call failed");
		}

		const totalDuration = Date.now() - totalStartTime;
		
		apiCallCounter.add(1, {
			endpoint: "/api/data",
			method: "GET",
			status: "success",
		});
		
		// Duración total de la operación
		operationDuration.record(totalDuration, {
			operation: "api_call",
			status: "success",
		});
		
		// ✅ LATENCIA ESPECÍFICA - SOLO LA LLAMADA A LA API
		apiCallLatency.record(apiDuration, {
			endpoint: "/api/data",
			status: "success",
		});

		await meterProvider.forceFlush();

		return {
			success: true,
			message: `API call exitosa en ${apiDuration}ms`,
			duration: apiDuration,
		};
	} catch (error) {
		const totalDuration = Date.now() - totalStartTime;

		apiCallCounter.add(1, {
			endpoint: "/api/data",
			method: "GET",
			status: "error",
		});

		errorCounter.add(1, {
			type: "api_error",
			endpoint: "/api/data",
		});

		operationDuration.record(totalDuration, {
			operation: "api_call",
			status: "error",
		});

		// ✅ REGISTRAR LATENCIA DE LA API INCLUSO EN ERROR
		apiCallLatency.record(apiDuration, {
			endpoint: "/api/data",
			status: "error",
		});

		await meterProvider.forceFlush();

		return {
			success: false,
			message: `API call falló después de ${apiDuration}ms`,
			duration: apiDuration,
		};
	}
}

// DEMO 2: Simular procesamiento de datos
// DEMO 2: Simular procesamiento de datos
export async function processData() {
	const startTime = Date.now();
	let duration = 0; // Inicializar aquí para que esté disponible en el catch

	try {
		await randomDelay(200, 3000);
		
        // 🚨 Agregar la condición de error aleatorio
		if (Math.random() < 0.2) {
			throw new Error("Data processing failed randomly");
		}
        
        // El resto de la lógica de éxito
		const size = Math.floor(Math.random() * 1024 * 1024 * 10);
		duration = Date.now() - startTime; // Asignar la duración en caso de éxito

		operationDuration.record(duration, {
			operation: "data_processing",
			type: "batch",
		});

		dataSize.record(size, {
			operation: "data_processing",
			format: "json",
		});

		apiCallCounter.add(1, {
			endpoint: "/api/process",
			method: "POST",
			status: "success",
		});

		// ✅ LATENCIA ESPECÍFICA (ÉXITO)
		dataProcessingLatency.record(duration, {
			operation: "data_processing",
			size_range: size > 1024 * 1024 * 5 ? "large" : "small",
		});

		await meterProvider.forceFlush();

		return {
			success: true,
			message: `Procesados ${(size / 1024 / 1024).toFixed(2)}MB en ${duration}ms`,
			duration,
			size,
		};
	} catch (error) {
		duration = Date.now() - startTime; // Recalcular/asignar la duración en caso de error

		// ✅ REGISTRAR EN ERROR
		errorCounter.add(1, {
			type: "data_processing_error",
            endpoint: "/api/process", // Se recomienda agregar el endpoint para trazabilidad
		});

		operationDuration.record(duration, {
			operation: "data_processing",
			status: "error",
		});

		dataProcessingLatency.record(duration, {
			operation: "data_processing",
			status: "error",
		});

		await meterProvider.forceFlush();

		return {
			success: false,
			message: `Procesamiento falló después de ${duration}ms`,
			duration,
		};
	}
}

// DEMO 3: Usuario conectándose
export async function userConnect() {
	await randomDelay(100, 500);

	activeUsers.add(1, {
		platform: "web",
		region: "us-east-1",
	});

	await meterProvider.forceFlush();

	return {
		success: true,
		message: "Usuario conectado (+1)",
		action: "connect",
	};
}

// DEMO 4: Usuario desconectándose
export async function userDisconnect() {
	await randomDelay(100, 500);

	activeUsers.add(-1, {
		platform: "web",
		region: "us-east-1",
	});

	await meterProvider.forceFlush();

	return {
		success: true,
		message: "Usuario desconectado (-1)",
		action: "disconnect",
	};
}

// DEMO 5: Agregar items al carrito
export async function addToCart(quantity: number = 1) {
	await randomDelay(100, 800);

	cartItems.add(quantity, {
		category: "electronics",
		user_type: "premium",
	});

	await meterProvider.forceFlush();

	return {
		success: true,
		message: `Agregados ${quantity} items al carrito`,
		quantity,
	};
}

// DEMO 6: Remover items del carrito
export async function removeFromCart(quantity: number = 1) {
	await randomDelay(100, 800);

	cartItems.add(-quantity, {
		category: "electronics",
		user_type: "premium",
	});

	await meterProvider.forceFlush();

	return {
		success: true,
		message: `Removidos ${quantity} items del carrito`,
		quantity,
	};
}

// DEMO 7: Operación compleja
export async function complexOperation() {
	const startTime = Date.now();

	try {
		const phase1Start = Date.now();
		await randomDelay(200, 800);
		const phase1Duration = Date.now() - phase1Start;

		apiCallCounter.add(1, {
			endpoint: "/api/order",
			method: "POST",
			status: "success",
		});

		const phase2Start = Date.now();
		await randomDelay(300, 1200);
		const phase2Duration = Date.now() - phase2Start;
		const dataBytes = Math.floor(Math.random() * 1024 * 100);

		dataSize.record(dataBytes, {
			operation: "order_processing",
			format: "json",
		});

		const phase3Start = Date.now();
		cartItems.add(-2, {
			category: "electronics",
			user_type: "premium",
		});
		const phase3Duration = Date.now() - phase3Start;

		if (Math.random() < 0.15) {
			throw new Error("Complex operation failed");
		}

		const duration = Date.now() - startTime;

		operationDuration.record(duration, {
			operation: "complex_operation",
			status: "success",
		});

		// ✅ LATENCIA ESPECÍFICA CON ATRIBUTOS
		complexOperationLatency.record(duration, {
			status: "success",
			phase: "completed",
		});

		await meterProvider.forceFlush();

		return {
			success: true,
			message: `Operación completa en ${duration}ms`,
			duration,
			phases: {
				phase1: `${phase1Duration}ms`,
				phase2: `${phase2Duration}ms`,
				phase3: `${phase3Duration}ms`,
			},
		};
	} catch (error) {
		const duration = Date.now() - startTime;

		errorCounter.add(1, {
			type: "complex_operation_error",
			endpoint: "/api/order",
		});

		operationDuration.record(duration, {
			operation: "complex_operation",
			status: "error",
		});

		// ✅ REGISTRAR LATENCIA EN ERROR TAMBIÉN
		complexOperationLatency.record(duration, {
			status: "error",
			phase: "failed",
		});

		await meterProvider.forceFlush();

		return {
			success: false,
			message: `Operación falló después de ${duration}ms`,
			duration,
		};
	}
}