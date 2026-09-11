import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WebSocketLike } from "@getpaseo/client/internal/daemon-client-transport-types";
import type { ConnectionState, PaseoAgent } from "@getpaseo/client";
import WebSocket from "ws";
import { parseDaemons, type DaemonTarget } from "./daemons.js";
import { deriveStatus, type ConnectionStatus, type PaseoStatus } from "./state.js";

const EMIT_DEBOUNCE_MS = 80;
const RESYNC_INTERVAL_MS = 60_000;

export interface MonitorSettings {
	daemons?: string;
	daemonUrl?: string;
	daemonPassword?: string;
}

export interface MonitorLogger {
	debug(message: string, data?: object): void;
	info(message: string, data?: object): void;
	warn(message: string, data?: object): void;
	error(message: string, data?: object): void;
}

const silentLogger: MonitorLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

interface DaemonConnection {
	target: DaemonTarget;
	client: DaemonClient;
	agents: Map<string, PaseoAgent>;
	state: ConnectionStatus;
	closed: boolean;
}

export class PaseoMonitor {
	private connections = new Map<string, DaemonConnection>();
	private settingsKey = "";
	private running = false;
	private logger: MonitorLogger = silentLogger;
	private readonly listeners = new Set<(status: PaseoStatus) => void>();
	private resyncTimer: ReturnType<typeof setInterval> | null = null;
	private emitTimer: ReturnType<typeof setTimeout> | null = null;

	onChange(listener: (status: PaseoStatus) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getStatus(): PaseoStatus {
		const agents = new Map<string, PaseoAgent>();
		let connected = 0;
		let connecting = 0;
		let unreachable = 0;

		for (const connection of this.connections.values()) {
			if (connection.state === "connected") {
				connected++;
			} else if (connection.state === "connecting") {
				connecting++;
			}

			if (connection.state !== "connected") {
				unreachable++;
			}

			for (const agent of connection.agents.values()) {
				agents.set(agent.id, agent);
			}
		}

		const connection: ConnectionStatus = connected > 0 ? "connected" : connecting > 0 ? "connecting" : "offline";
		return deriveStatus(agents.values(), connection, unreachable);
	}

	start(settings: MonitorSettings, logger: MonitorLogger = silentLogger): void {
		this.logger = logger;
		this.running = true;
		void this.applySettings(settings);
	}

	updateSettings(settings: MonitorSettings): void {
		void this.applySettings(settings);
	}

	stop(): void {
		this.running = false;
		void this.disconnectAll();
	}

	/** Clears Paseo's attention flag for finished/failed agents (not pending questions). */
	async acknowledge(): Promise<void> {
		for (const connection of this.connections.values()) {
			if (connection.state !== "connected") {
				continue;
			}

			const ids = [...connection.agents.values()]
				.filter((agent) => agent.requiresAttention && agent.attentionReason !== "permission")
				.map((agent) => agent.id);

			if (ids.length === 0) {
				continue;
			}

			try {
				await connection.client.clearAgentAttention(ids);
				this.logger.debug("cleared agent attention", { url: connection.target.url, count: ids.length });
			} catch (error) {
				this.logger.warn("failed to clear agent attention", {
					url: connection.target.url,
					error: String(error),
				});
			}
		}
	}

	private async applySettings(settings: MonitorSettings): Promise<void> {
		const targets = parseDaemons(settings);
		const key = JSON.stringify(targets.map((target) => [target.url, target.password ?? ""]));

		if (key === this.settingsKey && this.connections.size > 0) {
			return;
		}
		this.settingsKey = key;

		if (!this.running) {
			return;
		}

		await this.disconnectAll();
		if (!this.running) {
			return;
		}

		for (const target of targets) {
			this.connectTarget(target);
		}
		this.startResync();
		this.scheduleEmit();
	}

	private async disconnectAll(): Promise<void> {
		this.stopResync();
		const connections = [...this.connections.values()];
		this.connections = new Map();

		for (const connection of connections) {
			connection.closed = true;
			try {
				await connection.client.close();
			} catch {
				// already closed
			}
		}
		this.scheduleEmit();
	}

	private connectTarget(target: DaemonTarget): void {
		this.logger.info("connecting to Paseo daemon", { url: target.url });

		const client = new DaemonClient({
			url: target.url,
			clientId: `paseo-streamdeck-${Math.random().toString(36).slice(2, 10)}`,
			clientType: "browser",
			appVersion: "0.3.0",
			password: target.password,
			webSocketFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
			reconnect: { enabled: true, baseDelayMs: 1_000, maxDelayMs: 15_000 },
			logger: {
				debug: (data, message) => this.logger.debug(message ?? "debug", data),
				info: (data, message) => this.logger.info(message ?? "info", data),
				warn: (data, message) => this.logger.warn(message ?? "warn", data),
				error: (data, message) => this.logger.error(message ?? "error", data),
			},
		});

		const connection: DaemonConnection = {
			target,
			client,
			agents: new Map(),
			state: "connecting",
			closed: false,
		};
		this.connections.set(target.url, connection);

		client.subscribeConnectionStatus((state) => {
			if (connection.closed) {
				return;
			}
			connection.state = toConnectionStatus(state);
			if (connection.state === "connected") {
				void this.sync(connection);
			}
			this.scheduleEmit();
		});

		client.on("agent_update", (message) => {
			if (connection.closed) {
				return;
			}
			if (message.payload.kind === "upsert") {
				connection.agents.set(message.payload.agent.id, message.payload.agent);
			} else {
				connection.agents.delete(message.payload.agentId);
			}
			this.scheduleEmit();
		});

		client.connect().catch((error) => {
			this.logger.warn("daemon connection failed", { url: target.url, error: String(error) });
		});
	}

	private async sync(connection: DaemonConnection): Promise<void> {
		try {
			const result = await connection.client.fetchAgents({
				scope: "active",
				filter: { includeArchived: false },
				subscribe: {},
			});

			if (connection.closed) {
				return;
			}

			const next = new Map<string, PaseoAgent>();
			for (const entry of result.entries) {
				next.set(entry.agent.id, entry.agent);
			}
			connection.agents = next;
			this.scheduleEmit();
		} catch (error) {
			this.logger.warn("failed to fetch agents", { url: connection.target.url, error: String(error) });
		}
	}

	private startResync(): void {
		this.stopResync();
		this.resyncTimer = setInterval(() => {
			for (const connection of this.connections.values()) {
				if (connection.state === "connected") {
					void this.sync(connection);
				}
			}
		}, RESYNC_INTERVAL_MS);
	}

	private stopResync(): void {
		if (this.resyncTimer) {
			clearInterval(this.resyncTimer);
			this.resyncTimer = null;
		}
	}

	private scheduleEmit(): void {
		if (this.emitTimer) {
			return;
		}
		this.emitTimer = setTimeout(() => {
			this.emitTimer = null;
			const status = this.getStatus();
			for (const listener of this.listeners) {
				listener(status);
			}
		}, EMIT_DEBOUNCE_MS);
	}
}

function toConnectionStatus(state: ConnectionState): ConnectionStatus {
	if (state.status === "connected") {
		return "connected";
	}
	if (state.status === "connecting") {
		return "connecting";
	}
	return "offline";
}

export const monitor = new PaseoMonitor();
