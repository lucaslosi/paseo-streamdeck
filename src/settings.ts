export type GlobalSettings = {
	/** Newline-separated daemon definitions: "[label |] url [| password]". */
	daemons?: string;
	/** Legacy single-daemon settings, kept for backwards compatibility. */
	daemonUrl?: string;
	daemonPassword?: string;
	/** Path to the Paseo desktop executable (auto-detected when empty). */
	paseoPath?: string;
};

let current: GlobalSettings = {};

export function setGlobalSettings(settings: GlobalSettings | undefined): void {
	current = settings ?? {};
}

export function getGlobalSettings(): GlobalSettings {
	return current;
}
