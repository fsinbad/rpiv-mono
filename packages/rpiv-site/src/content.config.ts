import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const skills = defineCollection({
	loader: glob({ pattern: "*/SKILL.md", base: "../rpiv-pi/skills" }),
	schema: z.object({
		name: z.string(),
		description: z.string(),
		"argument-hint": z.union([z.string(), z.array(z.string())]).optional(),
		"allowed-tools": z.union([z.string(), z.array(z.string())]).optional(),
		"disable-model-invocation": z.boolean().optional(),
	}),
});

const agents = defineCollection({
	loader: glob({ pattern: "*.md", base: "../rpiv-pi/agents" }),
	schema: z.object({
		name: z.string(),
		description: z.string(),
		tools: z.string().optional(),
		isolated: z.boolean().optional(),
	}),
});

export const collections = { skills, agents };
