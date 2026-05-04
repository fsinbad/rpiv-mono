import { type CollectionEntry, getCollection } from "astro:content";

export type AgentEntry = CollectionEntry<"agents">;

export type CapabilityTier = "locator" | "analyzer" | "external" | "specialist";

const TIER_BY_NAME: Record<string, CapabilityTier> = {
	"codebase-locator": "locator",
	"thoughts-locator": "locator",
	"test-case-locator": "locator",
	"integration-scanner": "locator",
	"codebase-analyzer": "analyzer",
	"codebase-pattern-finder": "analyzer",
	"thoughts-analyzer": "analyzer",
	"precedent-locator": "analyzer",
	"web-search-researcher": "external",
	"claim-verifier": "specialist",
	"diff-auditor": "specialist",
	"peer-comparator": "specialist",
};

/** Counts from research §7 dispatcher table. Single-source-of-truth. */
export const DISPATCHER_COUNT: Record<string, number> = {
	"claim-verifier": 1,
	"codebase-analyzer": 9,
	"codebase-locator": 7,
	"codebase-pattern-finder": 5,
	"diff-auditor": 1,
	"integration-scanner": 4,
	"peer-comparator": 1,
	"precedent-locator": 3,
	"test-case-locator": 2,
	"thoughts-analyzer": 2,
	"thoughts-locator": 3,
	"web-search-researcher": 5,
};

/** Per research §7: full description for specialists + already-single-sentence locator/scanner trio. */
const FULL_DESCRIPTION_AGENTS = new Set([
	"claim-verifier",
	"diff-auditor",
	"peer-comparator",
	"precedent-locator",
	"codebase-locator",
	"integration-scanner",
	"test-case-locator",
]);

/** Trim jokey multi-sentence to first sentence; silently fix two known typos in thoughts-locator. */
export function siteDescription(agent: AgentEntry): string {
	const { name } = agent.data;
	let desc = agent.data.description;
	if (name === "thoughts-locator") {
		desc = desc.replace(/reseaching/g, "researching").replace(/equivilent/g, "equivalent");
	}
	if (FULL_DESCRIPTION_AGENTS.has(name)) return desc;
	return desc.split(/(?<=[.!?])\s+/, 2)[0]!;
}

export function tier(agent: AgentEntry): CapabilityTier {
	return TIER_BY_NAME[agent.data.name] ?? "analyzer";
}

const TIER_ORDER: CapabilityTier[] = ["locator", "analyzer", "specialist", "external"];

export async function getAgentsByTier(): Promise<Array<{ tier: CapabilityTier; agents: AgentEntry[] }>> {
	const all = await getCollection("agents");
	const groups = new Map<CapabilityTier, AgentEntry[]>(TIER_ORDER.map((t) => [t, []]));
	for (const a of all) groups.get(tier(a))!.push(a);
	for (const list of groups.values()) {
		list.sort((x, y) => x.data.name.localeCompare(y.data.name));
	}
	return TIER_ORDER.map((t) => ({ tier: t, agents: groups.get(t)! }));
}
