import { rm } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const APP_PORT = Number(process.env.MGE_APP_PORT ?? 5310);
const RENDER_PORT = Number(process.env.MGE_RENDER_PORT ?? 5311);

const excludeUploadsFromBuild = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'mge-exclude-uploads',
    apply: 'build',
    configResolved(resolved) {
      outDir = path.resolve(resolved.root, resolved.build.outDir);
    },
    closeBundle: async () => {
      await rm(path.join(outDir, 'uploads'), { recursive: true, force: true });
    },
  };
};

export default defineConfig({
  plugins: [react(), excludeUploadsFromBuild()],
  server: {
    port: APP_PORT,
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${RENDER_PORT}`,
      '/out': `http://localhost:${RENDER_PORT}`,
      '/uploads': `http://localhost:${RENDER_PORT}`,
    },
  },
});
