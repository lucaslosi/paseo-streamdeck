import type { PaseoStatus } from "../paseo/state.js";

const SIZE = 72;
const CARD = { x: 1, y: 1, size: 70, radius: 12 };

// Paseo's own status palette (favicon + status-dot colors).
const COLORS = {
	running: "#3b82f6", // blue  — loading
	attention: "#f59e0b", // amber — needs input
	failed: "#ef4444", // red   — failed
	done: "#22c55e", // green — done
	offline: "#7b8494",
	border: "rgba(255,255,255,0.12)",
} as const;

const FONT = "Segoe UI, SF Pro Display, Helvetica Neue, Arial, sans-serif";
const NUMBER_SIZE = 21;

const ROW_CENTERS = [16, 36, 56] as const;

export function renderStatusImage(status: PaseoStatus): string {
	const svg = status.connection === "connected" ? renderConnected(status) : renderDisconnected(status);
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function renderConnected(status: PaseoStatus): string {
	const attentionColor = status.failed > 0 ? COLORS.failed : COLORS.attention;
	const borderColor = status.attention > 0 ? attentionColor : COLORS.border;

	const rows: Array<{ centerY: number; color: string; count: number; icon: IconKind }> = [
		{ centerY: ROW_CENTERS[0], color: COLORS.running, count: status.running, icon: "running" },
		{ centerY: ROW_CENTERS[1], color: attentionColor, count: status.attention, icon: "attention" },
		{ centerY: ROW_CENTERS[2], color: COLORS.done, count: status.done, icon: "done" },
	];

	const rowMarkup = rows
		.map((row) => {
			const opacity = row.count === 0 ? 0.22 : 1;
			return (
				`<g opacity="${opacity}">` +
				icon(row.icon, 17, row.centerY, row.color) +
				`<text x="61" y="${textBaseline(row.centerY)}" text-anchor="end" font-family="${FONT}" font-size="${NUMBER_SIZE}" font-weight="700" fill="${row.color}">${row.count}</text>` +
				`</g>`
			);
		})
		.join("");

	const dividerMarkup = [ROW_CENTERS[0] + 10, ROW_CENTERS[1] + 10]
		.map((y) => `<line x1="10" y1="${y}" x2="62" y2="${y}" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/>`)
		.join("");

	const unreachableDot =
		status.unreachable > 0 ? `<circle cx="65" cy="8" r="2.2" fill="${COLORS.attention}"/>` : "";

	const defs =
		`<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e222c"/><stop offset="1" stop-color="#121419"/></linearGradient>` +
		`<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`;

	return wrap(
		`<defs>${defs}</defs>` +
			`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="url(#card)"/>` +
			`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="url(#sheen)"/>` +
			rowMarkup +
			dividerMarkup +
			unreachableDot +
			`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="none" stroke="${borderColor}" stroke-width="1.6"/>`,
	);
}

function renderDisconnected(status: PaseoStatus): string {
	const connecting = status.connection === "connecting";
	const color = connecting ? COLORS.attention : COLORS.offline;
	const label = connecting ? "CONNECTING" : "OFFLINE";
	const glyph = connecting
		? `<circle cx="28.5" cy="41" r="2.2" fill="${color}" opacity="0.4"/>` +
			`<circle cx="36" cy="41" r="2.6" fill="${color}"/>` +
			`<circle cx="43.5" cy="41" r="2.2" fill="${color}" opacity="0.7"/>`
		: `<circle cx="36" cy="41" r="3" fill="${color}"/>` +
			`<line x1="23" y1="18" x2="49" y2="47" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`;

	const defs =
		`<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e222c"/><stop offset="1" stop-color="#121419"/></linearGradient>`;

	return wrap(
		`<defs>${defs}</defs>` +
			`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="url(#card)"/>` +
			`<path d="M23.5 32 a14.5 14.5 0 0 1 25 0" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>` +
			glyph +
			`<text x="36" y="${(58 + 8.5 * 0.35).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8.5" font-weight="600" letter-spacing="1.3" fill="${color}">${label}</text>` +
			`<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="none" stroke="${COLORS.border}" stroke-width="1.6"/>`,
	);
}

type IconKind = "running" | "attention" | "done";

function icon(kind: IconKind, centerX: number, centerY: number, color: string): string {
	const scale = 1.05;
	if (kind === "running") {
		return `<path d="M${centerX - 4.2 * scale} ${centerY - 4.9 * scale} L${centerX + 4.7 * scale} ${centerY} L${centerX - 4.2 * scale} ${centerY + 4.9 * scale} Z" fill="${color}" stroke="${color}" stroke-width="${1.3 * scale}" stroke-linejoin="round"/>`;
	}

	if (kind === "attention") {
		return (
			`<rect x="${centerX - 1.1 * scale}" y="${centerY - 5.9 * scale}" width="${2.2 * scale}" height="${7.6 * scale}" rx="${1.1 * scale}" fill="${color}"/>` +
			`<circle cx="${centerX}" cy="${centerY + 4.8 * scale}" r="${1.4 * scale}" fill="${color}"/>`
		);
	}

	return `<path d="M${centerX - 3.9 * scale} ${centerY} l${2.4 * scale} ${2.4 * scale} l${5.2 * scale} ${-5.6 * scale}" fill="none" stroke="${color}" stroke-width="${2.3 * scale}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** SVG `y` of a text baseline so digits optically center on `centerY`. */
function textBaseline(centerY: number, fontSize = NUMBER_SIZE): number {
	return centerY + fontSize * 0.35;
}

function wrap(content: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${content}</svg>`;
}
