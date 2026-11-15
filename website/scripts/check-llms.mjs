// Build assertion: the website serves llms.txt.
import { existsSync } from "node:fs";

if (!existsSync("dist/client/llms.txt")) {
	console.error("dist/client/llms.txt is missing");
	process.exit(1);
}
