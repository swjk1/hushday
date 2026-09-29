/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';

/**
 * Serves the Vercel Functions in /api during `npm run dev`, using the same Web-standard
 * handlers (export GET/POST/...) that Vercel runs in production.
 */
function vercelApi(): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((done, fail) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => done(Buffer.concat(chunks)));
      req.on('error', fail);
    });

  return {
    name: 'vercel-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const file = resolve('api', `${url.pathname.slice(5).split('/')[0]}.ts`);
        if (!existsSync(file)) {
          res.statusCode = 404;
          return res.end('{"error":"Not found"}');
        }
        try {
          const mod = await server.ssrLoadModule(file);
          const handler = mod[req.method ?? 'GET'];
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            return res.end('{"error":"Method not allowed"}');
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(', '));
          }
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : new Uint8Array(await readBody(req));
          const response: Response = await handler(new Request(url, { method: req.method, headers, body }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          console.error(error);
          res.statusCode = 500;
          res.end('{"error":"Dev server error"}');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make server-side env (DATABASE_URL etc. from .env.local) visible to the dev API handlers.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) process.env[key] ??= value;
  return {
    plugins: [react(), vercelApi()],
    test: { include: ['src/**/*.test.ts'] },
  };
});
