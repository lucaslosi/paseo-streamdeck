import type { PaseoAgent } from "@getpaseo/client";

export type ConnectionStatus = "connected" | "connecting" | "offline";

export interface PaseoStatus {
	/** Daemon connection state. */
	connection: ConnectionStatus;
	/** Agents with a turn in flight. */
	running: number;
	/** Agents blocked on a question or permission request. */
	needsInput: number;
	/** Agents whose last turn failed with an error. */
	failed: number;
	/** Agents that finished and have not been acknowledged yet. */
	done: number;
	/** needsInput + failed. */
	attention: number;
	/** Total agents in the active scope. */
	total: number;
}

export function emptyStatus(connection: ConnectionStatus = "offline"): PaseoStatus {
	return { connection, running: 0, needsInput: 0, failed: 0, done: 0, attention: 0, total: 0 };
}

/**
 * Mirrors Paseo's own state-bucket precedence:
 * needs_input > failed > running > attention (done) > idle.
 */
export function deriveStatus(agents: Iterable<PaseoAgent>, connection: ConnectionStatus): PaseoStatus {
	let running = 0;
	let needsInput = 0;
	let failed = 0;
	let done = 0;
	let total = 0;

	for (const agent of agents) {
		total++;

		if (agent.pendingPermissions.length > 0 || agent.attentionReason === "permission") {
			needsInput++;
			continue;
		}

		if (agent.status === "error" || agent.attentionReason === "error") {
			failed++;
			continue;
		}

		if (agent.status === "running" || agent.status === "initializing") {
			running++;
			continue;
		}

		if (agent.requiresAttention) {
			done++;
		}
	}

	return {
		connection,
		running,
		needsInput,
		failed,
		done,
		attention: needsInput + failed,
		total,
	};
}
