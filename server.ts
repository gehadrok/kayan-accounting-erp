import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/server/routes.ts';
import { getDb, closeDb, getDataDir } from './src/server/db.ts';
import { assertSessionSecretReady } from './src/server/sessionTokens.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // PHASE 10.5.3 — refuse to boot in production without a configured session
  // secret (see sessionTokens.ts). Fails BEFORE the database opens or the
  // port listens; the secret value itself is never printed. Development
  // keeps its per-process ephemeral secret (sessions die on restart).
  try {
    assertSessionSecretReady();
  } catch (err: any) {
    console.error('[Auth] Server startup refused: ' + (err?.message || 'session secret misconfigured'));
    process.exit(1);
  }

  // PHASE 10.0.1: the company-logo upload posts base64 image bytes as JSON.
  // express.json() defaults to a 100kb limit, which rejects every realistic
  // logo (a 180 KB PNG becomes ~240 KB once base64-encoded) with HTTP 413 —
  // the server's own 2 MB logo rule was never even reached. The limit is
  // therefore raised only for this one path, sized to fit the documented 2 MB
  // logo ceiling plus base64 overhead, while every other endpoint keeps the
  // default and stays protected against oversized bodies.
  const LOGO_UPLOAD_LIMIT = '3mb';
  app.use('/api/company/logo', express.json({ limit: LOGO_UPLOAD_LIMIT }));

  app.use(express.json());

  // Initialize the PERSISTENT database and apply migrations on boot.
  // PHASE 10.4: this used to log the failure and continue to `app.listen()`,
  // which meant a database that could not be opened still produced a fully
  // working-looking server whose every query failed. A storage failure must
  // stop the process instead.
  try {
    await getDb();
    console.log(`[PostgreSQL] Persistent database ready at ${getDataDir()}, migrations applied.`);
  } catch (err: any) {
    console.error('[PostgreSQL Error] Initialization failure — server will NOT start.');
    console.error(err?.message || err);
    process.exit(1);
  }

  // PHASE 10.4: flush PGlite's filesystem layer to disk on a clean shutdown.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] ${signal} received — closing the database…`);
    try {
      await closeDb();
    } catch (err) {
      console.error('[Server] Error while closing the database:', err);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Mount API endpoints
  app.use('/api', apiRouter);

  // Fallback for unmatched /api requests: NEVER allow Vite SPA middleware to return HTML for API requests!
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: `API endpoint '${req.method} ${req.originalUrl}' not found`,
      path: req.originalUrl,
    });
  });

  // Development: Mount Vite SPA middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve compiled static files
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [Kayan Accounting ERP] Full-Stack server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
