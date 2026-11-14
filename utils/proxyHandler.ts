import type { IncomingMessage, ServerResponse } from 'http';
import { validateProxyTargetUrl } from './proxySecurity';

export const ALLOWED_PROXY_HEADERS = new Set([
  'authorization',
  'accept',
  'content-type',
  'x-requested-with',
]);

export interface ProxyHandlerOptions {
  corsProxyKey?: string;
  fetchImpl?: typeof fetch;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Shared Canvas reverse-proxy handler used by both Express (server.ts) and Vite middleware (vite.config.ts).
 */
export function createCanvasProxyHandler(options: ProxyHandlerOptions = {}) {
  return async (
    req: IncomingMessage & { query?: Record<string, any>; body?: any },
    res: ServerResponse
  ) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      let targetUrl: string | undefined = typeof req.query?.url === 'string' ? req.query.url : undefined;

      if (!targetUrl && req.url) {
        try {
          const parsedReqUrl = new URL(req.url, 'http://localhost:3000');
          targetUrl = parsedReqUrl.searchParams.get('url') || undefined;
        } catch {
          if (req.url.includes('url=')) {
            targetUrl = decodeURIComponent(req.url.slice(req.url.indexOf('url=') + 4));
          }
        }
      }

      if (!targetUrl) {
        sendJson(res, 400, { error: 'Missing "url" query parameter' });
        return;
      }

      const urlCheck = validateProxyTargetUrl(targetUrl);
      if (!urlCheck.valid) {
        sendJson(res, 403, { error: urlCheck.reason || 'Blocked proxy target URL' });
        return;
      }

      let bodyBuffer: Buffer | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        if (chunks.length > 0) {
          bodyBuffer = Buffer.concat(chunks);
        } else if (req.body !== undefined) {
          bodyBuffer = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
        }
      }

      // Forward ONLY clean API headers (strip browser cookies, origin, referer, sec-*, x-forwarded-*)
      const forwardHeaders: Record<string, string> = {
        'User-Agent': 'Velm-Canvas-Proxy/1.0',
      };
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) continue;
        const lower = key.toLowerCase();
        if (ALLOWED_PROXY_HEADERS.has(lower)) {
          forwardHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
        }
      }

      // Securely inject server-side CORS key if external proxy is targeted
      let fetchUrl = targetUrl;
      const proxyKey = options.corsProxyKey ?? process.env.CORS_PROXY_KEY ?? process.env.VITE_CORSPROXY_KEY;
      if (fetchUrl.includes('corsproxy.io') && proxyKey && !fetchUrl.includes('key=')) {
        const separator = fetchUrl.includes('?') ? '&' : '?';
        fetchUrl = `${fetchUrl}${separator}key=${encodeURIComponent(proxyKey)}`;
      }

      const doFetch = options.fetchImpl || fetch;
      const response = await doFetch(fetchUrl, {
        method: req.method || 'GET',
        headers: forwardHeaders,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuffer : undefined,
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
      sendJson(res, 502, { error: 'Proxy request failed: ' + (err?.message || String(err)) });
    }
  };
}
