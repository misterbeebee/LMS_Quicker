import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function createProxyHandler() {
  return async (req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      const reqUrl = new URL(req.url || '', 'http://localhost:3000');
      let targetUrl = reqUrl.searchParams.get('url');

      if (!targetUrl && req.url && req.url.includes('url=')) {
        targetUrl = decodeURIComponent(req.url.slice(req.url.indexOf('url=') + 4));
      }

      if (!targetUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing "url" query parameter' }));
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      const forwardHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) continue;
        const lower = key.toLowerCase();
        if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue;
        forwardHeaders[key] = Array.isArray(value) ? value.join(', ') : (value as string);
      }

      const response = await fetch(targetUrl, {
        method: req.method || 'GET',
        headers: forwardHeaders,
        body: (req.method !== 'GET' && req.method !== 'HEAD') ? bodyBuffer : undefined,
        redirect: 'follow',
      });

      res.statusCode = response.status;
      response.headers.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (lower !== 'content-encoding' && lower !== 'transfer-encoding' && lower !== 'content-length') {
          res.setHeader(key, val);
        }
      });
      res.setHeader('Access-Control-Allow-Origin', '*');

      const arrayBuffer = await response.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } catch (err: any) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Proxy request failed: ' + err.message }));
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'canvas-api-proxy',
          configureServer(server) {
            server.middlewares.use('/api/proxy', createProxyHandler());
          },
          configurePreviewServer(server) {
            server.middlewares.use('/api/proxy', createProxyHandler());
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
