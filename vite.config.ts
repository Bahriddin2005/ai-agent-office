import { defineConfig, type Plugin } from 'vite';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

const root = import.meta.dirname;
const libraryDir = resolve(root, 'library');
const api = `http://127.0.0.1:${process.env.OFFICE_PORT || 3334}`;

// Serve library/ at /library in dev and copy it into dist/ on build, so the
// inspector can show full agent/skill files even without the office server.
function library(): Plugin {
  return {
    name: 'office-library',
    configureServer(server) {
      server.middlewares.use('/library', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^([/\\])+/, '');
        const file = join(libraryDir, rel);
        if (!file.startsWith(libraryDir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(libraryDir)) cpSync(libraryDir, resolve(root, 'dist', 'library'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [library()],
  server: {
    port: 3333,
    proxy: {
      '/api': api,
      '/ws': { target: api.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
