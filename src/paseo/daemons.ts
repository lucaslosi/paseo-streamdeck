export const DEFAULT_DAEMON_URL = "ws://127.0.0.1:6767/ws";

export interface DaemonTarget {
	url: string;
	password?: string;
	label?: string;
}

/**
 * Parses the `daemons` global setting. One daemon per line:
 *
 *   ws://127.0.0.1:6767/ws
 *   homelab | ws://192.168.0.138:6767/ws
 *   homelab | ws://192.168.0.138:6767/ws | secret
 *
 * A line with two parts is interpreted as URL + password when the first part
 * looks like a URL, otherwise as label + URL.
 */
export function parseDaemons(settings: { daemons?: string; daemonUrl?: string; daemonPassword?: string }): DaemonTarget[] {
	const lines = (settings.daemons ?? "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const targets: DaemonTarget[] = [];

	for (const line of lines) {
		const parts = line.split("|").map((part) => part.trim());
		const first = parts[0];

		if (!first) {
			continue;
		}

		let label: string | undefined;
		let url: string;
		let password: string | undefined;

		if (parts.length === 1) {
			url = first;
		} else if (parts.length === 2) {
			if (first.includes("://")) {
				url = first;
				password = parts[1];
			} else {
				label = first;
				url = parts[1] ?? "";
			}
		} else {
			label = first;
			url = parts[1] ?? "";
			password = parts[2];
		}

		if (!url) {
			continue;
		}

		targets.push({ url, password: password || undefined, label });
	}

	if (targets.length === 0) {
		const legacyUrl = settings.daemonUrl?.trim() || DEFAULT_DAEMON_URL;
		targets.push({ url: legacyUrl, password: settings.daemonPassword?.trim() || undefined });
	}

	const unique = new Map<string, DaemonTarget>();
	for (const target of targets) {
		unique.set(target.url, target);
	}
	return [...unique.values()];
}
