// Build assertion: llms-small.txt stays small and llms.txt links every documentation set.
import { readFileSync, statSync, existsSync } from "node:fs";

const max = 120 * 1024;
const size = statSync("dist/llms-small.txt").size;
if (size > max) {
	console.error(`llms-small.txt is ${size} bytes, above ${max}`);
	process.exit(1);
}
const index = readFileSync("dist/llms.txt", "utf8");
for (const set of ["core-concepts", "cli-reference", "resource-guides", "ci-and-wordpress-plugin", "cookbook", "blog"]) {
	if (!index.includes(`/_llms-txt/${set}.txt`) || !existsSync(`dist/_llms-txt/${set}.txt`)) {
		console.error(`llms.txt does not link the ${set} set`);
		process.exit(1);
	}
}
