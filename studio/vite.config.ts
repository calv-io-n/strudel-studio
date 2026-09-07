import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./client', import.meta.url)),
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: {
    main: fileURLToPath(new URL('./client/index.html', import.meta.url)),
    render: fileURLToPath(new URL('./client/render.html', import.meta.url)),
  } } },
});
