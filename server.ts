import http from 'http';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Lazy initialize GoogleGenAI client on server
  let geminiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not configured. Please set it in Settings > Secrets.');
      }
      geminiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return geminiClient;
  }

  // Gemini Academic Workload Analysis endpoint
  app.post('/api/gemini/analyze', express.json({ limit: '10mb' }), async (req, res) => {
    try {
      const { prompt, model } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing prompt in request body' });
        return;
      }

      // Map any old, deprecated, or non-existent model IDs to valid current models
      let targetModel = model || 'gemini-3.8-flash';
      if (
        typeof targetModel !== 'string' ||
        targetModel.includes('2.5') || 
        targetModel.includes('2.0') || 
        targetModel.includes('1.5') || 
        targetModel === 'gemini-pro'
      ) {
        targetModel = 'gemini-3.8-flash';
      }

      const ai = getGeminiClient();
      let response;
      let finalModel = targetModel;

      try {
        response = await ai.models.generateContent({
          model: targetModel,
          contents: prompt,
        });
      } catch (firstErr: any) {
        const errStr = String(firstErr.message || '');
        if (
          errStr.includes('503') || 
          errStr.includes('UNAVAILABLE') || 
          errStr.includes('404') || 
          errStr.includes('NOT_FOUND') ||
          errStr.includes('high demand')
        ) {
          const fallbacks = ['gemini-flash-latest', 'gemini-3.1-flash-lite'].filter(m => m !== targetModel);
          let succeeded = false;
          for (const fallbackModel of fallbacks) {
            try {
              console.log(`[Gemini Server] Retrying with fallback model ${fallbackModel}...`);
              response = await ai.models.generateContent({
                model: fallbackModel,
                contents: prompt,
              });
              finalModel = fallbackModel;
              succeeded = true;
              break;
            } catch (fallbackErr: any) {
              console.warn(`[Gemini Server] Fallback ${fallbackModel} failed:`, fallbackErr.message);
            }
          }
          if (!succeeded) {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }

      res.json({
        analysis: response.text || 'No analysis generated.',
        modelUsed: finalModel,
      });
    } catch (err: any) {
      console.error('[Gemini Server Error]', err);
      let errorMessage = err.message || 'Failed to generate analysis';
      if (typeof errorMessage === 'string' && errorMessage.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(errorMessage.trim());
          if (parsed.error && parsed.error.message) {
            errorMessage = parsed.error.message;
          }
        } catch {
          // ignore parsing error
        }
      }
      const statusCode = err.status || (typeof err.code === 'number' && err.code >= 400 && err.code < 600 ? err.code : 500);
      res.status(statusCode).json({
        error: errorMessage,
        details: err.error || err,
      });
    }
  });

  // Canvas API proxy to bypass browser CORS restrictions in both dev and production
  app.all('/api/proxy', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    try {
      let targetUrl = req.query.url as string | undefined;

      if (!targetUrl && req.url && req.url.includes('url=')) {
        targetUrl = decodeURIComponent(req.url.slice(req.url.indexOf('url=') + 4));
      }

      if (!targetUrl) {
        res.status(400).json({ error: 'Missing "url" query parameter' });
        return;
      }

      // Collect request body if POST / PUT / PATCH
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

      // Securely inject server-side CORS key if external proxy is targeted
      let fetchUrl = targetUrl;
      const proxyKey = process.env.CORS_PROXY_KEY || process.env.VITE_CORSPROXY_KEY;
      if (fetchUrl.includes('corsproxy.io') && proxyKey && !fetchUrl.includes('key=')) {
        const separator = fetchUrl.includes('?') ? '&' : '?';
        fetchUrl = `${fetchUrl}${separator}key=${encodeURIComponent(proxyKey)}`;
      }

      const response = await fetch(fetchUrl, {
        method: req.method || 'GET',
        headers: forwardHeaders,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuffer : undefined,
        redirect: 'follow',
      });

      res.status(response.status);
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
      res.status(502).json({ error: 'Proxy request failed: ' + err.message });
    }
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
