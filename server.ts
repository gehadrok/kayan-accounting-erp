import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/server/routes.ts';
import { getDb } from './src/server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // Initialize PostgreSQL database and apply migrations on boot
  try {
    await getDb();
    console.log('[PostgreSQL] Database ready and migrations applied.');
  } catch (err) {
    console.error('[PostgreSQL Error] Initialization failure:', err);
  }

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
