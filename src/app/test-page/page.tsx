"use client";

import { useState } from "react";
import {
	simulateApiCall,
	processData,
	userConnect,
	userDisconnect,
	addToCart,
	removeFromCart,
	complexOperation,
} from "./test-page-actions";

interface LogEntry {
	id: number;
	message: string;
	type: "success" | "error" | "info";
	timestamp: Date;
}

export default function TestPage() {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [loading, setLoading] = useState<string | null>(null);

	const addLog = (message: string, type: "success" | "error" | "info") => {
		setLogs((prev) => [
			{
				id: Date.now(),
				message,
				type,
				timestamp: new Date(),
			},
			...prev.slice(0, 19), // Mantener solo las últimas 20 entradas
		]);
	};

	const handleAction = async (
		action: () => Promise<{ success: boolean; message: string }>,
		actionName: string
	) => {
		setLoading(actionName);
		addLog(`🔄 Ejecutando: ${actionName}...`, "info");
		try {
			const result = await action();
			addLog(
				`✅ ${actionName}: ${result.message}`,
				result.success ? "success" : "error"
			);
		} catch {
			addLog(`❌ ${actionName}: Error`, "error");
		} finally {
			setLoading(null);
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
			<div className="max-w-7xl mx-auto">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-4xl font-bold text-white mb-2">
						🎯 OpenTelemetry Metrics Demo
					</h1>
					<p className="text-gray-400">
						Interactúa con las diferentes métricas y observa los
						datos en SigNoz
					</p>
				</div>

				<div className="grid lg:grid-cols-2 gap-8">
					{/* Panel de controles */}
					<div className="space-y-6">
						{/* COUNTER Metrics */}
						<div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
							<div className="flex items-center gap-2 mb-4">
								<div className="w-3 h-3 bg-blue-500 rounded-full"></div>
								<h2 className="text-xl font-semibold text-white">
									Counter Metrics
								</h2>
							</div>
							<p className="text-sm text-gray-400 mb-4">
								Solo incrementan. Perfecto para contar eventos
								(requests, errores, etc)
							</p>
							<div className="space-y-3">
								<button
									onClick={() =>
										handleAction(
											simulateApiCall,
											"Llamada API"
										)
									}
									disabled={loading !== null}
									className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
								>
									{loading === "Llamada API"
										? "⏳ Ejecutando..."
										: "📡 Simular API Call"}
								</button>
								<p className="text-xs text-gray-500">
									Incrementa: <code>api_calls_total</code>,{" "}
									<code>errors_total</code> (20% fallo)
								</p>
							</div>
						</div>

						{/* HISTOGRAM Metrics */}
						<div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
							<div className="flex items-center gap-2 mb-4">
								<div className="w-3 h-3 bg-purple-500 rounded-full"></div>
								<h2 className="text-xl font-semibold text-white">
									Histogram Metrics
								</h2>
							</div>
							<p className="text-sm text-gray-400 mb-4">
								Miden distribuciones (latencias, tamaños,
								duraciones)
							</p>
							<div className="space-y-3">
								<button
									onClick={() =>
										handleAction(
											processData,
											"Procesar Datos"
										)
									}
									disabled={loading !== null}
									className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
								>
									{loading === "Procesar Datos"
										? "⏳ Ejecutando..."
										: "⚡ Procesar Datos"}
								</button>
								<p className="text-xs text-gray-500">
									Registra: <code>operation_duration_ms</code>
									, <code>data_size_bytes</code>
								</p>
							</div>
						</div>

						{/* UPDOWNCOUNTER Metrics */}
						<div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
							<div className="flex items-center gap-2 mb-4">
								<div className="w-3 h-3 bg-green-500 rounded-full"></div>
								<h2 className="text-xl font-semibold text-white">
									UpDownCounter Metrics
								</h2>
							</div>
							<p className="text-sm text-gray-400 mb-4">
								Pueden subir o bajar (usuarios activos, items en
								carrito)
							</p>
							<div className="space-y-3">
								<div className="flex gap-2">
									<button
										onClick={() =>
											handleAction(
												userConnect,
												"Usuario Conectado"
											)
										}
										disabled={loading !== null}
										className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
									>
										{loading === "Usuario Conectado"
											? "⏳"
											: "➕ Conectar"}
									</button>
									<button
										onClick={() =>
											handleAction(
												userDisconnect,
												"Usuario Desconectado"
											)
										}
										disabled={loading !== null}
										className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
									>
										{loading === "Usuario Desconectado"
											? "⏳"
											: "➖ Desconectar"}
									</button>
								</div>
								<div className="flex gap-2">
									<button
										onClick={() =>
											handleAction(
												() => addToCart(3),
												"Agregar al Carrito"
											)
										}
										disabled={loading !== null}
										className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
									>
										{loading === "Agregar al Carrito"
											? "⏳"
											: "🛒➕ Agregar (3)"}
									</button>
									<button
										onClick={() =>
											handleAction(
												() => removeFromCart(2),
												"Remover del Carrito"
											)
										}
										disabled={loading !== null}
										className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
									>
										{loading === "Remover del Carrito"
											? "⏳"
											: "🛒➖ Remover (2)"}
									</button>
								</div>
								<p className="text-xs text-gray-500">
									Modifica: <code>active_users</code>,{" "}
									<code>cart_items</code>
								</p>
							</div>
						</div>

						{/* Operación Compleja */}
						<div className="bg-gray-800 rounded-lg p-6 border border-yellow-600">
							<div className="flex items-center gap-2 mb-4">
								<div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
								<h2 className="text-xl font-semibold text-white">
									Operación Compleja
								</h2>
							</div>
							<p className="text-sm text-gray-400 mb-4">
								Combina múltiples tipos de métricas en una sola
								operación
							</p>
							<button
								onClick={() =>
									handleAction(
										complexOperation,
										"Operación Compleja"
									)
								}
								disabled={loading !== null}
								className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
							>
								{loading === "Operación Compleja"
									? "⏳ Ejecutando..."
									: "🚀 Ejecutar Operación Compleja"}
							</button>
							<p className="text-xs text-gray-500 mt-3">
								Usa Counter, Histogram y UpDownCounter (15%
								fallo)
							</p>
						</div>
					</div>

					{/* Panel de logs */}
					<div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
						<div className="flex items-center justify-between mb-4">
							<h2 className="text-xl font-semibold text-white">
								📊 Activity Log
							</h2>
							<button
								onClick={() => setLogs([])}
								className="text-sm text-gray-400 hover:text-white transition-colors"
							>
								Clear
							</button>
						</div>
						<div className="space-y-2 max-h-[800px] overflow-y-auto">
							{logs.length === 0 ? (
								<p className="text-gray-500 text-center py-8">
									No hay actividad aún. Presiona un botón para
									empezar.
								</p>
							) : (
								logs.map((log) => (
									<div
										key={log.id}
										className={`p-3 rounded-lg border ${
											log.type === "success"
												? "bg-green-900/20 border-green-700/30 text-green-300"
												: log.type === "error"
												? "bg-red-900/20 border-red-700/30 text-red-300"
												: "bg-blue-900/20 border-blue-700/30 text-blue-300"
										}`}
									>
										<p className="text-sm font-medium">
											{log.message}
										</p>
										<p className="text-xs opacity-70 mt-1">
											{log.timestamp.toLocaleTimeString()}
										</p>
									</div>
								))
							)}
						</div>
					</div>
				</div>

				{/* Info Footer */}
				<div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
					<h3 className="text-lg font-semibold text-white mb-3">
						📖 Cómo usar este demo
					</h3>
					<div className="grid md:grid-cols-3 gap-4 text-sm text-gray-300">
						<div>
							<h4 className="font-semibold text-blue-400 mb-2">
								1. Counter
							</h4>
							<p>
								Monótono creciente. Ideal para contar eventos
								totales (requests, errores, etc).
							</p>
						</div>
						<div>
							<h4 className="font-semibold text-purple-400 mb-2">
								2. Histogram
							</h4>
							<p>
								Distribuciones. Mide latencias, tamaños,
								duraciones. Calcula percentiles automáticamente.
							</p>
						</div>
						<div>
							<h4 className="font-semibold text-green-400 mb-2">
								3. UpDownCounter
							</h4>
							<p>
								Puede subir/bajar. Perfecto para gauges
								(usuarios activos, memoria, cola de jobs).
							</p>
						</div>
					</div>
					<div className="mt-4 p-3 bg-gray-900 rounded border border-gray-600">
						<p className="text-xs text-gray-400">
							💡 <strong>Tip:</strong> Ve a SigNoz en{" "}
							<a
								href="http://localhost:8080"
								target="_blank"
								className="text-blue-400 hover:underline"
							>
								http://localhost:8080
							</a>{" "}
							→ Metrics para ver estas métricas en tiempo real con
							gráficos y dashboards.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
