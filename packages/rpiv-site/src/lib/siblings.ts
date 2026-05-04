import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Sibling {
	pkg: string; // e.g. @juicesharp/rpiv-advisor
	name: string; // e.g. rpiv-advisor — directory + cover-import key
	description: string; // verbatim from package.json:4
	homepage: string; // GitHub tree URL from package.json
	npmUrl: string; // https://www.npmjs.com/package/...
}

export const SIBLING_NAMES = [
	"rpiv-advisor",
	"rpiv-args",
	"rpiv-ask-user-question",
	"rpiv-btw",
	"rpiv-i18n",
	"rpiv-todo",
	"rpiv-web-tools",
] as const;

export type SiblingName = (typeof SIBLING_NAMES)[number];

function readPkg(name: SiblingName): { name: string; description: string; homepage: string } {
	const url = new URL(`../../../${name}/package.json`, import.meta.url);
	return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

export function loadSiblings(): Sibling[] {
	return SIBLING_NAMES.map((name) => {
		const json = readPkg(name);
		return {
			pkg: json.name,
			name,
			description: json.description,
			homepage: json.homepage,
			npmUrl: `https://www.npmjs.com/package/${json.name}`,
		};
	});
}
