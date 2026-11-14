import http from 'http';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { registerApiRoutes, resolveAppVersion } from './utils/apiRoutes';

const SERVER_STARTED_AT = new Date().toISOString();
const SERVER_APP_VERSION = resolveAppVersion();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  registerApiRoutes(app, {
    version: SERVER_APP_VERSION,
    buildTimestamp: SERVER_STARTED_AT,
  });

  // Vite middleware for development; static file serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
