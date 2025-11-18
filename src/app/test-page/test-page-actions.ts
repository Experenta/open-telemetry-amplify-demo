"use server";

import { metrics } from "@opentelemetry/api";

// Obtener el meter para crear métricas
const meter = metrics.getMeter("demo-metrics");

// 1. COUNTER - Para contar eventos (solo incrementa)
const apiCallCounter = meter.createCounter("api_calls_total", {
	description: "Total de llamadas API",
	unit: "calls",
});

const errorCounter = meter.createCounter("errors_total", {
	description: "Total de errores",
	unit: "errors",
});

// 2. HISTOGRAM - Para medir distribuciones (latencias, tamaños, etc)
const operationDuration = meter.createHistogram("operation_duration_ms", {
	description: "Duración de operaciones en milisegundos",
	unit: "ms",
});

const dataSize = meter.createHistogram("data_size_bytes", {
	description: "Tamaño de datos procesados",
	unit: "bytes",
});

// 3. UPDOWNCOUNTER - Para valores que suben y bajan (gauges)
const activeUsers = meter.createUpDownCounter("active_users", {
	description: "Usuarios activos en el sistema",
	unit: "users",
});

const cartItems = meter.createUpDownCounter("cart_items", {
	description: "Items en el carrito",
	unit: "items",
});

// Helper para simular operaciones asíncronas con delay random
async function randomDelay(min: number = 100, max: number = 2000) {
	const delay = Math.floor(Math.random() * (max - min + 1)) + min;
	await new Promise((resolve) => setTimeout(resolve, delay));
	return delay;
}

// DEMO 1: Simular llamada API con Counter y Histogram
export async function simulateApiCall() {
	const startTime = Date.now();

	try {
		// Simular trabajo con delay random
		await randomDelay(100, 1500);

		// Simular fallo random (20% de probabilidad)
		if (Math.random() < 0.2) {
			throw new Error("API call failed");
		}

		// Registrar métricas de éxito
		const duration = Date.now() - startTime;
		apiCallCounter.add(1, {
			endpoint: "/api/data",
			method: "GET",
			status: "success",
		});
		operationDuration.record(duration, {
			operation: "api_call",
			status: "success",
		});

		return {
			success: true,
			message: `API call exitosa en ${duration}ms`,
			duration,
		};
	} catch {
		// Registrar métricas de error
		const duration = Date.now() - startTime;
		apiCallCounter.add(1, {
			endpoint: "/api/data",
			method: "GET",
			status: "error",
		});
		errorCounter.add(1, {
			type: "api_error",
			endpoint: "/api/data",
		});
		operationDuration.record(duration, {
			operation: "api_call",
			status: "error",
		});

		return {
			success: false,
			message: `API call falló después de ${duration}ms`,
			duration,
		};
	}
}

// DEMO 2: Simular procesamiento de datos con Histogram
export async function processData() {
	const startTime = Date.now();

	// Simular procesamiento con delay random
	await randomDelay(200, 3000);

	// Generar tamaño de datos random
	const size = Math.floor(Math.random() * 1024 * 1024 * 10); // 0-10MB

	const duration = Date.now() - startTime;

	// Registrar métricas
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

	return {
		success: true,
		message: `Procesados ${(size / 1024 / 1024).toFixed(
			2
		)}MB en ${duration}ms`,
		duration,
		size,
	};
}

// DEMO 3: Simular usuario conectándose (UpDownCounter)
export async function userConnect() {
	await randomDelay(100, 500);

	// Incrementar usuarios activos
	activeUsers.add(1, {
		platform: "web",
		region: "us-east-1",
	});

	return {
		success: true,
		message: "Usuario conectado (+1)",
		action: "connect",
	};
}

// DEMO 4: Simular usuario desconectándose (UpDownCounter)
export async function userDisconnect() {
	await randomDelay(100, 500);

	// Decrementar usuarios activos
	activeUsers.add(-1, {
		platform: "web",
		region: "us-east-1",
	});

	return {
		success: true,
		message: "Usuario desconectado (-1)",
		action: "disconnect",
	};
}

// DEMO 5: Agregar items al carrito (UpDownCounter)
export async function addToCart(quantity: number = 1) {
	await randomDelay(100, 800);

	cartItems.add(quantity, {
		category: "electronics",
		user_type: "premium",
	});

	return {
		success: true,
		message: `Agregados ${quantity} items al carrito`,
		quantity,
	};
}

// DEMO 6: Remover items del carrito (UpDownCounter)
export async function removeFromCart(quantity: number = 1) {
	await randomDelay(100, 800);

	cartItems.add(-quantity, {
		category: "electronics",
		user_type: "premium",
	});

	return {
		success: true,
		message: `Removidos ${quantity} items del carrito`,
		quantity,
	};
}

// DEMO 7: Operación compleja que combina múltiples métricas
export async function complexOperation() {
	const startTime = Date.now();

	try {
		// Fase 1: Consultar API
		await randomDelay(200, 800);
		apiCallCounter.add(1, {
			endpoint: "/api/order",
			method: "POST",
			status: "success",
		});

		// Fase 2: Procesar datos
		await randomDelay(300, 1200);
		const dataBytes = Math.floor(Math.random() * 1024 * 100);
		dataSize.record(dataBytes, {
			operation: "order_processing",
			format: "json",
		});

		// Fase 3: Actualizar carrito
		cartItems.add(-2, {
			category: "electronics",
			user_type: "premium",
		});

		// Simular fallo ocasional
		if (Math.random() < 0.15) {
			throw new Error("Complex operation failed");
		}

		const duration = Date.now() - startTime;
		operationDuration.record(duration, {
			operation: "complex_operation",
			status: "success",
		});

		return {
			success: true,
			message: `Operación completa en ${duration}ms`,
			duration,
		};
	} catch {
		const duration = Date.now() - startTime;
		errorCounter.add(1, {
			type: "complex_operation_error",
			endpoint: "/api/order",
		});
		operationDuration.record(duration, {
			operation: "complex_operation",
			status: "error",
		});

		return {
			success: false,
			message: `Operación falló después de ${duration}ms`,
			duration,
		};
	}
}
