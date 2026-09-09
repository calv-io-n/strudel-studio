import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ command }) => ({
  publicDir: command === 'build' ? false : 'public',
  plugins: [{ name: 'static-metadata', apply: 'build', async generateBundle() {
    const root = fileURLToPath(new URL('./client/public', import.meta.url));
    const copy = async (dir: string) => { for (const item of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await copy(file);
      else if (!/\.(wav|mp3|ogg|flac)$/i.test(item.name)) this.emitFile({ type: 'asset', fileName: path.relative(root, file), source: await readFile(file) });
    } }; await copy(root);
  } }],
  root: fileURLToPath(new URL('./client', import.meta.url)),
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: {
    main: fileURLToPath(new URL('./client/index.html', import.meta.url)),
    render: fileURLToPath(new URL('./client/render.html', import.meta.url)),
  } } },
}));
