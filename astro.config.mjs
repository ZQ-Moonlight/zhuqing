// astro.config.mjs
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

const site = process.env.SITE_URL ?? 'https://zhuqing.tech';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  integrations: [{
    name: 'hosting-size-guard',
    hooks: {
      'astro:build:done': async () => {
        await import('./scripts/prepare-large-pdf-downloads.mjs');
        await import('./scripts/prepare-deploy-assets.mjs');
        await import('./scripts/verify-cloudflare-pdf-downloads.mjs');
      },
    },
  }],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
