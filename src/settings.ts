export type GlobalSettings = {
	daemonUrl?: string;
	daemonPassword?: string;
	paseoPath?: string;
};

let current: GlobalSettings = {};

export function setGlobalSettings(settings: GlobalSettings | undefined): void {
	current = settings ?? {};
}

export function getGlobalSettings(): GlobalSettings {
	return current;
}
