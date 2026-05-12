import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPublishedPosts } from "../../lib/posts";

export async function GET(context: APIContext) {
	if (!context.site) {
		throw new Error("`site` must be configured in astro.config.mjs to generate the RSS feed.");
	}

	const posts = await getPublishedPosts();

	return rss({
		title: "rpiv-pi Blog",
		description: "Updates, deep dives, and release notes for rpiv-pi.",
		site: context.site,
		xmlns: { atom: "http://www.w3.org/2005/Atom" },
		items: posts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.pubDate,
			description: post.data.description,
			link: `/blog/${post.id}`,
			...(post.data.updatedDate && {
				customData: `<atom:updated>${post.data.updatedDate.toISOString()}</atom:updated>`,
			}),
		})),
		customData: `<language>en-us</language>`,
	});
}
