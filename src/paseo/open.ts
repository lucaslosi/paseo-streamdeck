import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** Launches Paseo Desktop, or focuses the existing window (single-instance app). */
export function openPaseo(configuredPath?: string): void {
	const custom = configuredPath?.trim();

	if (process.platform === "win32") {
		const executable =
			custom || path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Paseo", "Paseo.exe");

		if (existsSync(executable)) {
			spawnDetached(executable, []);
			return;
		}

		spawnDetached("cmd", ["/c", "start", "", custom || "Paseo"]);
		return;
	}

	if (process.platform === "darwin") {
		if (custom) {
			spawnDetached("open", [custom]);
			return;
		}
		spawnDetached("open", ["-a", "Paseo"]);
		return;
	}

	spawnDetached(custom || "paseo", []);
}

function spawnDetached(command: string, args: string[]): void {
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.on("error", () => {});
		child.unref();
	} catch {
		// Paseo is not installed or cannot be launched; the key still acknowledges.
	}
}
