import type { PaseoStatus } from "../paseo/state.js";

const SIZE = 72;

const COLORS = {
	running: "#3ddc84",
	attention: "#f5a623",
	failed: "#ff5c5c",
	done: "#4da3ff",
	offline: "#6b7280",
	background: "#15171c",
	border: "rgba(255,255,255,0.12)",
} as const;

const FONT = "Segoe UI, SF Pro Display, Helvetica Neue, Arial, sans-serif";

export function renderStatusImage(status: PaseoStatus): string {
	const svg = status.connection === "connected" ? renderConnected(status) : renderOffline(status);
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function renderConnected(status: PaseoStatus): string {
	const attentionColor = status.failed > 0 ? COLORS.failed : COLORS.attention;
	const borderColor = status.attention > 0 ? attentionColor : COLORS.border;

	const rows: Array<{ glyph: string; color: string; count: number }> = [
		{ glyph: "\u25B6", color: COLORS.running, count: status.running },
		{ glyph: "!", color: attentionColor, count: status.attention },
		{ glyph: "\u2713", color: COLORS.done, count: status.done },
	];

	const rowMarkup = rows
		.map((row, index) => {
			const y = 18 + index * 18;
			const opacity = row.count === 0 ? 0.25 : 1;
			return (
				`<text x="15" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}"` +
				` font-size="15" font-weight="800" fill="${row.color}" opacity="${opacity}">${row.glyph}</text>` +
				`<text x="58" y="${y}" text-anchor="end" dominant-baseline="central" font-family="${FONT}"` +
				` font-size="21" font-weight="800" fill="${row.color}" opacity="${opacity}">${row.count}</text>`
			);
		})
		.join("");

	return wrap(
		`<rect x="1" y="1" width="70" height="70" rx="11" fill="${COLORS.background}" stroke="${borderColor}" stroke-width="2"/>` +
			rowMarkup,
	);
}

function renderOffline(status: PaseoStatus): string {
	const label = status.connection === "connecting" ? "CONNECTING" : "OFFLINE";
	const glyph = status.connection === "connecting" ? "\u00B7\u00B7\u00B7" : "\u2014";
	const fontSize = label.length > 8 ? 8 : 9;

	return wrap(
		`<rect x="1" y="1" width="70" height="70" rx="11" fill="${COLORS.background}" stroke="${COLORS.border}" stroke-width="2"/>` +
			`<text x="36" y="31" text-anchor="middle" dominant-baseline="central" font-family="${FONT}"` +
			` font-size="24" font-weight="700" fill="${COLORS.offline}" opacity="0.7">${glyph}</text>` +
			`<text x="36" y="50" text-anchor="middle" dominant-baseline="central" font-family="${FONT}"` +
			` font-size="${fontSize}" font-weight="600" letter-spacing="1.2" fill="${COLORS.offline}">${label}</text>`,
	);
}

function wrap(content: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${content}</svg>`;
}
