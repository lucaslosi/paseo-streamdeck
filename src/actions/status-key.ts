import streamDeck, {
	action,
	SingletonAction,
	type KeyAction,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import { focusOrLaunchPaseo } from "../paseo/open.js";
import { monitor } from "../paseo/monitor.js";
import type { PaseoStatus } from "../paseo/state.js";
import { renderStatusImage } from "../render/svg.js";
import { getGlobalSettings } from "../settings.js";

@action({ UUID: "com.lucaslosi.paseo-status.status" })
export class StatusKeyAction extends SingletonAction {
	private readonly keys = new Map<string, KeyAction>();

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		const key = ev.action as KeyAction;
		this.keys.set(key.id, key);
		await this.render(key, monitor.getStatus());
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.keys.delete(ev.action.id);
	}

	override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
		await monitor.acknowledge();
		await this.renderAll(monitor.getStatus());
		focusOrLaunchPaseo(getGlobalSettings().paseoPath, {
			debug: (message) => streamDeck.logger.debug(message),
			warn: (message) => streamDeck.logger.warn(message),
		});
	}

	async renderAll(status: PaseoStatus): Promise<void> {
		await Promise.all([...this.keys.values()].map((key) => this.render(key, status)));
	}

	private async render(key: KeyAction, status: PaseoStatus): Promise<void> {
		try {
			await key.setImage(renderStatusImage(status));
		} catch (error) {
			streamDeck.logger.debug(`failed to render status key: ${String(error)}`);
		}
	}
}
