import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// UI model tests now compose the same shared controls as the browser build.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) } },
});
