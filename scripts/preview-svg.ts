import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderStatusImage } from "../src/render/svg.js";
import type { PaseoStatus } from "../src/paseo/state.js";

const outDir = process.argv[2] ?? ".";
mkdirSync(outDir, { recursive: true });

const cases: Array<{ name: string; status: PaseoStatus }> = [
	{
		name: "connected",
		status: { connection: "connected", running: 2, needsInput: 1, failed: 0, done: 3, attention: 1, total: 6 },
	},
	{
		name: "failed",
		status: { connection: "connected", running: 0, needsInput: 0, failed: 2, done: 0, attention: 2, total: 2 },
	},
	{
		name: "empty",
		status: { connection: "connected", running: 0, needsInput: 0, failed: 0, done: 0, attention: 0, total: 0 },
	},
	{ name: "offline", status: { connection: "offline", running: 0, needsInput: 0, failed: 0, done: 0, attention: 0, total: 0 } },
	{
		name: "connecting",
		status: { connection: "connecting", running: 0, needsInput: 0, failed: 0, done: 0, attention: 0, total: 0 },
	},
];

for (const testCase of cases) {
	const dataUri = renderStatusImage(testCase.status);
	const svg = Buffer.from(dataUri.split(",")[1]!, "base64").toString("utf8");
	writeFileSync(join(outDir, `${testCase.name}.svg`), svg);
	console.log(`wrote ${testCase.name}.svg`);
}
