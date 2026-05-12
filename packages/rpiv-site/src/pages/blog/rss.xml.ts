import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
	const posts = await getCollection("posts", ({ data }) => !data.draft);
	const sorted = posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

	return rss({
		title: "rpiv-pi Blog",
		description: "Updates, deep dives, and release notes for rpiv-pi.",
		site: context.site!,
		items: sorted.map((post) => ({
			title: post.data.title,
			pubDate: post.data.pubDate,
			description: post.data.description,
			link: `/blog/${post.id}`,
		})),
		customData: `<language>en-us</language>`,
	});
}
