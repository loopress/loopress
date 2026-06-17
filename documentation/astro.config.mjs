// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';
import sitemap from '@astrojs/sitemap';
import { createRequire } from 'module';
import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);

/** @returns {import('astro').AstroIntegration} */
function loopressFavicon() {
    return {
        name: 'loopress-favicon',
        hooks: {
            'astro:config:setup': () => {
                const src = require.resolve('@loopress/assets/loopress-logo-black.svg');
                mkdirSync(join(__dirname, 'public'), { recursive: true });
                copyFileSync(src, join(__dirname, 'public', 'favicon.svg'));
            },
        },
    };
}

// https://astro.build/config
export default defineConfig({
    site: "https://docs.loopress.dev",
    redirects: {
        '/': '/guides/getting-started',
    },
    integrations: [
        loopressFavicon(),
        starlight({
            title: 'Loopress',
            favicon: '/favicon.svg',
            components: {
                PageFrame: './src/components/PageFrame.astro',
            },
            plugins: [
                starlightBlog({
                    authors: {
                        maxime: {
                            name: 'Maxime Blanc',
                            url: 'https://github.com/jean-smaug',
                        },
                    },
                }),
            ],
            social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/loopress' }],
            sidebar: [
                {
                    label: 'Guides',
                    items: [
                        { label: 'Getting Started', slug: 'guides/getting-started' },
                    ],
                },
                {
                    label: 'WordPress Plugin',
                    items: [
                        { label: 'Overview', slug: 'wordpress-plugin' },
                        { label: 'Dependency Management', slug: 'wordpress-plugin/dependencies' },
                        { label: 'Using packages in snippets', slug: 'wordpress-plugin/code-snippets' },
                    ],
                },
                {
                    label: 'CLI',
                    items: [
                        { label: 'Overview', slug: 'cli' },
                        { label: 'Getting Started', slug: 'cli/getting-started' },
                        { label: 'Snippets', slug: 'cli/snippets' },
                    ],
                },
            ],
        }),
        sitemap(),
    ],
});
