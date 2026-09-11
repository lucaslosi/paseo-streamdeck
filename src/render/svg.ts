import type { PaseoStatus } from "../paseo/state.js";

const SIZE = 72;
const CARD = { x: 1.5, y: 1.5, size: 69, radius: 12 };
const BAND_HEIGHT = 23.1;

const COLORS = {
	running: "#3ddc84",
	attention: "#f5a623",
	failed: "#ff5c5c",
	done: "#4da3ff",
	offline: "#7b8494",
	background: "#15171e",
	border: "rgba(255,255,255,0.12)",
} as const;

const FONT = "Segoe UI, SF Pro Display, Helvetica Neue, Arial, sans-serif";

export function renderStatusImage(status: PaseoStatus): string {
	const svg = status.connection === "connected" ? renderConnected(status) : renderDisconnected(status);
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function renderConnected(status: PaseoStatus): string {
	const attentionColor = status.failed > 0 ? COLORS.failed : COLORS.attention;
	const borderColor = status.attention > 0 ? attentionColor : COLORS.border;

	const bands: Array<{ color: string; count: number; icon: IconKind; top: number }> = [
		{ color: COLORS.running, count: status.running, icon: "running", top: CARD.y },
		{ color: attentionColor, count: status.attention, icon: "attention", top: CARD.y + BAND_HEIGHT },
		{ color: COLORS.done, count: status.done, icon: "done", top: CARD.y + BAND_HEIGHT * 2 },
	];

	const bandMarkup = bands
		.map((band) => {
			const centerY = band.top + BAND_HEIGHT / 2;
			const opacity = band.count === 0 ? 0.27 : 1;
			const fill = band.count === 0 ? "#ffffff" : band.color;
			const fillOpacity = band.count === 0 ? 0.035 : 0.13;

			return (
				`<rect x="${CARD.x}" y="${band.top}" width="${CARD.size}" height="${BAND_HEIGHT}" fill="${fill}" fill-opacity="${fillOpacity}"/>` +
				`<rect x="${CARD.x}" y="${band.top}" width="${CARD.size}" height="1" fill="#ffffff" fill-opacity="0.04"/>` +
				`<g opacity="${opacity}">${icon(band.icon, centerY, band.color)}` +
				`<text x="59" y="${centerY}" text-anchor="end" dominant-baseline="central" font-family="${FONT}" font-size="19" font-weight="700" fill="${band.color}">${band.count}</text></g>`
			);
		})
		.join("");

	const defs =
		`<clipPath id="card"><rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}"/></clipPath>` +
		`<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.07"/><stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`;

	const unreachableDot =
		status.unreachable > 0
			? `<circle cx="8" cy="64.5" r="2.2" fill="${COLORS.attention}"/>`
			: "";

	return wrap(
		`<defs>${defs}</defs>` +
			`<g clip-path="url(#card)">` +
			`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" fill="${COLORS.background}"/>` +
			bandMarkup +
			`<rect x="${CARD.x}" y="${CARD.y + BAND_HEIGHT}" width="${CARD.size}" height="1" fill="#000000" fill-opacity="0.35"/>` +
			`<rect x="${CARD.x}" y="${CARD.y + BAND_HEIGHT * 2}" width="${CARD.size}" height="1" fill="#000000" fill-opacity="0.35"/>` +
			`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" fill="url(#sheen)"/>` +
			unreachableDot +
			`</g>` +
			`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="none" stroke="${borderColor}" stroke-width="1.6"/>`,
	);
}

function renderDisconnected(status: PaseoStatus): string {
	const connecting = status.connection === "connecting";
	const color = connecting ? COLORS.attention : COLORS.offline;
	const label = connecting ? "CONNECTING" : "OFFLINE";
	const glyph = connecting
		? `<circle cx="28.5" cy="39.5" r="2.2" fill="${color}" opacity="0.4"/>` +
			`<circle cx="36" cy="39.5" r="2.6" fill="${color}"/>` +
			`<circle cx="43.5" cy="39.5" r="2.2" fill="${color}" opacity="0.7"/>`
		: `<circle cx="36" cy="39.5" r="3" fill="${color}"/>` +
			`<line x1="23" y1="16.5" x2="49" y2="45.5" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`;

	return wrap(
		`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="${COLORS.background}" stroke="${COLORS.border}" stroke-width="1.6"/>` +
			`<path d="M23.5 30.5 a14.5 14.5 0 0 1 25 0" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>` +
			glyph +
			`<text x="36" y="57" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="8.5" font-weight="600" letter-spacing="1.3" fill="${color}">${label}</text>`,
	);
}

type IconKind = "running" | "attention" | "done";

function icon(kind: IconKind, centerY: number, color: string): string {
	if (kind === "running") {
		return `<path d="M13 ${centerY - 6.4} L23 ${centerY} L13 ${centerY + 6.4} Z" fill="${color}" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>`;
	}

	if (kind === "attention") {
		return (
			`<rect x="14.8" y="${centerY - 7.4}" width="2.6" height="9.4" rx="1.3" fill="${color}"/>` +
			`<circle cx="16.1" cy="${centerY + 6.4}" r="1.6" fill="${color}"/>`
		);
	}

	return `<path d="M12.4 ${centerY} l2.9 2.9 l6.4 -6.9" fill="none" stroke="${color}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function wrap(content: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${content}</svg>`;
}
