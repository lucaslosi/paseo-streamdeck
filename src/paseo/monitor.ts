import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WebSocketLike } from "@getpaseo/client/internal/daemon-client-transport-types";
import type { ConnectionState, PaseoAgent } from "@getpaseo/client";
import WebSocket from "ws";
import { deriveStatus, type ConnectionStatus, type PaseoStatus } from "./state.js";

export const DEFAULT_DAEMON_URL = "ws://127.0.0.1:6767/ws";

const EMIT_DEBOUNCE_MS = 80;
const RESYNC_INTERVAL_MS = 60_000;

export interface MonitorSettings {
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

export class PaseoMonitor {
	private client: DaemonClient | null = null;
	private agents = new Map<string, PaseoAgent>();
	private connection: ConnectionStatus = "offline";
	private settings: MonitorSettings = {};
	private logger: MonitorLogger = silentLogger;
	private readonly listeners = new Set<(status: PaseoStatus) => void>();
	private resyncTimer: ReturnType<typeof setInterval> | null = null;
	private emitTimer: ReturnType<typeof setTimeout> | null = null;
	private running = false;

	onChange(listener: (status: PaseoStatus) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getStatus(): PaseoStatus {
		return deriveStatus(this.agents.values(), this.connection);
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
		this.stopResync();
		const client = this.client;
		this.client = null;
		if (client) void client.close();
	}

	/** Clears Paseo's attention flag for finished/failed agents (not pending questions). */
	async acknowledge(): Promise<void> {
		const client = this.client;
		if (!client || this.connection !== "connected") {
			return;
		}

		const ids = [...this.agents.values()]
			.filter((agent) => agent.requiresAttention && agent.attentionReason !== "permission")
			.map((agent) => agent.id);

		if (ids.length === 0) {
			return;
		}

		try {
			await client.clearAgentAttention(ids);
			this.logger.debug("cleared agent attention", { count: ids.length });
		} catch (error) {
			this.logger.warn("failed to clear agent attention", { error: String(error) });
		}
	}

	private async applySettings(settings: MonitorSettings): Promise<void> {
		const nextUrl = settings.daemonUrl?.trim() || DEFAULT_DAEMON_URL;
		const nextPassword = settings.daemonPassword?.trim() || undefined;
		const changed = nextUrl !== this.currentUrl || nextPassword !== this.currentPassword;
		this.settings = { ...settings, daemonUrl: nextUrl, daemonPassword: nextPassword };

		if (!changed && this.client) {
			return;
		}

		this.currentUrl = nextUrl;
		this.currentPassword = nextPassword;

		if (!this.running) {
			return;
		}

		await this.disconnect();
		this.connect();
	}

	private currentUrl = DEFAULT_DAEMON_URL;
	private currentPassword: string | undefined;

	private async disconnect(): Promise<void> {
		this.stopResync();
		const client = this.client;
		this.client = null;
		this.agents = new Map();
		this.connection = "offline";
		if (client) {
			try {
				await client.close();
			} catch {
				// already closed
			}
		}
		this.scheduleEmit();
	}

	private connect(): void {
		const url = this.currentUrl;
		this.logger.info("connecting to Paseo daemon", { url });

		const client = new DaemonClient({
			url,
			clientId: `paseo-streamdeck-${Math.random().toString(36).slice(2, 10)}`,
			clientType: "browser",
			appVersion: "0.1.0",
			password: this.currentPassword,
			webSocketFactory: (url) => new WebSocket(url) as unknown as WebSocketLike,
			reconnect: { enabled: true, baseDelayMs: 1_000, maxDelayMs: 15_000 },
			logger: {
				debug: (data, message) => this.logger.debug(message ?? "debug", data),
				info: (data, message) => this.logger.info(message ?? "info", data),
				warn: (data, message) => this.logger.warn(message ?? "warn", data),
				error: (data, message) => this.logger.error(message ?? "error", data),
			},
		});

		this.client = client;

		client.subscribeConnectionStatus((state) => {
			if (client !== this.client) {
				return;
			}
			this.handleConnectionState(state);
		});

		client.on("agent_update", (message) => {
			if (client !== this.client) {
				return;
			}
			if (message.payload.kind === "upsert") {
				this.agents.set(message.payload.agent.id, message.payload.agent);
			} else {
				this.agents.delete(message.payload.agentId);
			}
			this.scheduleEmit();
		});

		client.connect().catch((error) => {
			this.logger.warn("daemon connection failed", { url, error: String(error) });
		});
	}

	private handleConnectionState(state: ConnectionState): void {
		if (state.status === "connected") {
			this.connection = "connected";
			this.startResync();
			void this.sync();
		} else if (state.status === "connecting") {
			this.connection = "connecting";
			this.stopResync();
		} else {
			this.connection = "offline";
			this.stopResync();
		}
		this.scheduleEmit();
	}

	private async sync(): Promise<void> {
		const client = this.client;
		if (!client) {
			return;
		}

		try {
			const result = await client.fetchAgents({
				scope: "active",
				filter: { includeArchived: false },
				subscribe: {},
			});

			if (client !== this.client) {
				return;
			}

			const next = new Map<string, PaseoAgent>();
			for (const entry of result.entries) {
				next.set(entry.agent.id, entry.agent);
			}
			this.agents = next;
			this.scheduleEmit();
		} catch (error) {
			this.logger.warn("failed to fetch agents", { error: String(error) });
		}
	}

	private startResync(): void {
		this.stopResync();
		this.resyncTimer = setInterval(() => void this.sync(), RESYNC_INTERVAL_MS);
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

export const monitor = new PaseoMonitor();
