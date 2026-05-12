import { type CollectionEntry, getCollection } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

interface PostWithReadingTime extends PostEntry {
	readingTime: number;
}

export function computeReadingTime(body: string): number {
	const words = body.split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.ceil(words / 200));
}

export async function getAllPosts(): Promise<PostWithReadingTime[]> {
	const posts = await getCollection("posts", ({ data }) => !data.draft);
	return posts
		.map((post) => ({
			...post,
			readingTime: computeReadingTime(post.body ?? ""),
		}))
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
