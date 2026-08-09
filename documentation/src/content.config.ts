import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { blogSchema } from 'starlight-blog/schema';
import { z } from 'astro/zod';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: (context) =>
				blogSchema(context).extend({
					// The Loopress CLI and WordPress plugin versions current when a blog post was
					// published, shown next to the post's date. Optional: not every post demos a
					// specific version-dependent feature (drafts, pre-release posts).
					cliVersion: z.string().optional(),
					wordpressPluginVersion: z.string().optional(),
					// Cookbook recipes only: which Loopress mechanism the recipe is built on, drives
					// the closing CTA that MarkdownContent.astro appends automatically.
					kind: z.enum(['route', 'snippet']).optional(),
				}),
		}),
	}),
};
