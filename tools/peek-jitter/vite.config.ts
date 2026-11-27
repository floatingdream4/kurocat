import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({ root: __dirname, base: './', build: { outDir: path.resolve(__dirname, 'dist'), emptyOutDir: true, assetsInlineLimit: 0 } });
