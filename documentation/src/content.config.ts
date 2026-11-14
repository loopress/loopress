import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { blogSchema } from 'starlight-blog/schema';
import { z } from 'astro/zod';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: (context) => docsSchema({
			extend: (context) =>
				blogSchema(context).extend({
					// The Loopress CLI and WordPress plugin versions current when a blog post was
					// published, shown next to the post's date. Optional: not every post demos a
					// specific version-dependent feature (drafts, pre-release posts).
					cliVersion: z.string().optional(),
					wordpressPluginVersion: z.string().optional(),
					// Which plugin edition provides the feature a page documents, rendered as a note at
					// the top of the page by MarkdownContent.astro. `light`: both editions (Loopress Light
					// and Loopress Full). `full`: Loopress Full only.
					edition: z.enum(['light', 'full']).optional(),
					// Cookbook recipes only: which Loopress mechanism the recipe is built on, drives
					// the closing CTA that MarkdownContent.astro appends automatically. `site`: a recipe
					// built from several Loopress resources (post types, taxonomies, routes...) rather
					// than one Composer package.
					kind: z.enum(['route', 'snippet', 'app', 'site']).optional(),
					// Cookbook recipes only: the matching video on the Loopress YouTube channel,
					// embedded above the recipe by MarkdownContent.astro.
					youtubeId: z.string().optional(),
				}),
		})(context).transform((data) => {
			// Blog posts publish by date, not by hand: a post is published when its `date` is
			// today or earlier at build time, whatever `draft` says, and excluded (page, sitemap,
			// RSS, llms*.txt, tag pages) otherwise. Only blog posts have a `date`. A daily
			// rebuild publishes future posts on their date.
			if (data.date) return { ...data, draft: data.date.getTime() > Date.now() };
			return data;
		}),
	}),
};
