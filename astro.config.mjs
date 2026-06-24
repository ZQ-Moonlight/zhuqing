// astro.config.mjs
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://zhuqing.tech';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
});
