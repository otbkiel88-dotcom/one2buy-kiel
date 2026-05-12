import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://one2buy-kiel.de',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
