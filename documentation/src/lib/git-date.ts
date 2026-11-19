import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Date of the last commit that touched a file, for `dateModified` in the JSON-LD. Undefined when
// git is missing or the file is untracked. In a shallow clone the boundary commit carries every
// file, so its date says nothing about when one changed: undefined too, rather than a wrong date.
const cache = new Map<string, Date | undefined>();
let shallow: Set<string> | undefined;

// Build-time only, fixed arguments plus a content file path from the docs loader.
const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim(); // NOSONAR: build script, git from PATH like every other build tool

function shallowCommits(): Set<string> {
	if (shallow) return shallow;
	shallow = new Set();
	try {
		const file = git(["rev-parse", "--git-path", "shallow"]);
		if (existsSync(file)) {
			for (const line of readFileSync(file, "utf8").split("\n")) if (line) shallow.add(line.trim());
		}
	} catch {
		// no git: lastCommitDate returns undefined anyway
	}
	return shallow;
}

export function lastCommitDate(filePath: string): Date | undefined {
	if (cache.has(filePath)) return cache.get(filePath);
	let date: Date | undefined;
	try {
		const out = git(["log", "-1", "--format=%H %cI", "--", filePath]);
		const [hash, iso] = out.split(" ");
		if (hash && iso && !shallowCommits().has(hash)) date = new Date(iso);
	} catch {
		date = undefined;
	}
	cache.set(filePath, date);
	return date;
}
