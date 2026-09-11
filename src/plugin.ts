import streamDeck from "@elgato/streamdeck";
import { StatusKeyAction } from "./actions/status-key.js";
import { monitor } from "./paseo/monitor.js";
import { setGlobalSettings, type GlobalSettings } from "./settings.js";

const statusKey = new StatusKeyAction();

streamDeck.actions.registerAction(statusKey);

monitor.onChange((status) => {
	void statusKey.renderAll(status);
});

await streamDeck.connect();

const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
setGlobalSettings(settings);

monitor.start(
	{
		daemonUrl: settings.daemonUrl,
		daemonPassword: settings.daemonPassword,
	},
	{
		debug: (message, data) => streamDeck.logger.debug(format(message, data)),
		info: (message, data) => streamDeck.logger.info(format(message, data)),
		warn: (message, data) => streamDeck.logger.warn(format(message, data)),
		error: (message, data) => streamDeck.logger.error(format(message, data)),
	},
);

streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
	const next = ev.settings as GlobalSettings;
	setGlobalSettings(next);
	monitor.updateSettings({
		daemonUrl: next.daemonUrl,
		daemonPassword: next.daemonPassword,
	});
});

await statusKey.renderAll(monitor.getStatus());

function format(message: string, data?: object): string {
	return data ? `${message} ${JSON.stringify(data)}` : message;
}
