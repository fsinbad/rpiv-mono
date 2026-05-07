import { type CollectionEntry, getCollection } from "astro:content";

type SpecEntry = CollectionEntry<"skillSpecs">;

export type SkillEntry = {
	slug: string;
	tagline: string;
	body: string | undefined;
	data: SpecEntry["data"];
};

const PIPELINE = ["discover", "research", "design", "plan", "implement", "validate"] as const;
const SECONDARY = ["blueprint", "explore", "migrate-to-guidance"] as const;
const CODE_REVIEW_FLOW = ["commit", "code-review", "changelog", "validate"] as const;

export async function getPipelineSkills(): Promise<SkillEntry[]> {
	return resolve(PIPELINE);
}

export async function getSecondaryFlowSkills(): Promise<SkillEntry[]> {
	return resolve(SECONDARY);
}

export async function getCodeReviewSkills(): Promise<SkillEntry[]> {
	return resolve(CODE_REVIEW_FLOW);
}

export async function getSkill(name: string): Promise<SkillEntry> {
	const [specs, copies] = await Promise.all([getCollection("skillSpecs"), getCollection("skills")]);
	const spec = specs.find((s) => s.data.name === name);
	if (!spec) throw new Error(`skill spec not found: ${name}`);
	return merge(spec, copies);
}

async function resolve(names: readonly string[]): Promise<SkillEntry[]> {
	const [specs, copies] = await Promise.all([getCollection("skillSpecs"), getCollection("skills")]);
	return names.map((n) => {
		const spec = specs.find((s) => s.data.name === n);
		if (!spec) throw new Error(`skill spec not found: ${n}`);
		return merge(spec, copies);
	});
}

function merge(spec: SpecEntry, copies: CollectionEntry<"skills">[]): SkillEntry {
	const copy = copies.find((c) => c.data.slug === spec.data.name);
	return {
		slug: spec.data.name,
		tagline: copy?.data.tagline ?? spec.data.description,
		body: copy?.body,
		data: spec.data,
	};
}

/** Artifact write site for §1 / §2 / §3 detail rows. `null` = no thoughts/ artifact. */
export const ARTIFACT_WRITE_SITES: Record<string, string | null> = {
	discover: "thoughts/shared/discover/",
	research: "thoughts/shared/research/",
	design: "thoughts/shared/designs/",
	plan: "thoughts/shared/plans/",
	implement: null,
	validate: null,
	blueprint: "thoughts/shared/plans/",
	explore: "thoughts/shared/solutions/",
	"annotate-guidance": ".rpiv/guidance/<sub>/architecture.md",
	"migrate-to-guidance": ".rpiv/guidance/ shadow tree",
	"code-review": "thoughts/shared/reviews/",
	commit: null,
	changelog: null,
	revise: null,
};

/** Pipeline-step presentation copy for the home-page emaki — kept here (not in
 * skill specs) so the narrative is editable without re-deriving specs. */
export type PipelineMeta = { collects: string[]; why: string };
export const PIPELINE_META: Record<string, PipelineMeta> = {
	discover: {
		collects: ["Goals", "Non-Goals", "Functional Requirements", "Acceptance Criteria", "Decisions"],
		why: "One question at a time captures intent before any code is read. Stops research from chasing the wrong target.",
	},
	research: {
		collects: ["Open questions", "Codebase facts", "Cross-file traces", "Cited line refs"],
		why: "Parallel analysis agents answer structured questions and synthesize one cited document. Design reads this, not the codebase.",
	},
	design: {
		collects: ["Architectural decisions", "Vertical slices", "File map", "Ordering", "Risk notes"],
		why: "Decomposes the feature into the smallest set of vertical slices that can land independently.",
	},
	plan: {
		collects: ["Atomic phases", "Parallelization graph", "Success criteria", "Rollback notes"],
		why: "Turns the design into phases sized for one verification loop each, with the criteria that prove a phase is done.",
	},
	implement: {
		collects: ["Code edits", "Phase verification logs", "Failure-recovery notes"],
		why: "Executes phases one at a time, runs the success criteria, refuses to advance until they pass.",
	},
	validate: {
		collects: ["Pass/fail per criterion", "Drift notes", "Follow-up tickets"],
		why: "Independent re-check of the plan against the working tree. Catches half-finished phases the implement loop missed.",
	},
};
