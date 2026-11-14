import fs from 'fs';
import path from 'path';
import express, { Express } from 'express';
import { GoogleGenAI } from '@google/genai';
import { createCanvasProxyHandler } from './proxyHandler';

export interface ApiRouteOptions {
  version?: string;
  buildTimestamp?: string;
  proxyFetchImpl?: typeof fetch;
  geminiClientFactory?: () => GoogleGenAI;
  corsProxyKey?: string;
}

export function resolveAppVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    if (pkg?.version) return pkg.version;
  } catch {
    // fallback version
  }
  return '1.8.0';
}

export function sanitizeServerGeminiModel(model?: unknown): string {
  let targetModel = typeof model === 'string' && model.trim() ? model.trim() : 'gemini-3.8-flash';
  if (
    targetModel.includes('2.5') ||
    targetModel.includes('2.0') ||
    targetModel.includes('1.5') ||
    targetModel === 'gemini-pro'
  ) {
    targetModel = 'gemini-3.8-flash';
  }
  return targetModel;
}

export function registerApiRoutes(app: Express, options: ApiRouteOptions = {}): void {
  const version = options.version || resolveAppVersion();
  const buildTimestamp = options.buildTimestamp || new Date().toISOString();

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version,
      buildTimestamp,
    });
  });

  // Diagnostics & Automated Test Suite Runner endpoint
  app.post('/api/tests/run', express.json(), async (req, res) => {
    try {
      const { runIntegrationTestSuite } = await import('../scripts/test-runner');
      const results = await runIntegrationTestSuite(req.body);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to run test suite: ' + (err.message || String(err)) });
    }
  });

  // Lazy initialize GoogleGenAI client on server
  let geminiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (options.geminiClientFactory) {
      return options.geminiClientFactory();
    }
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
      const { prompt, model } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing prompt in request body' });
        return;
      }

      const targetModel = sanitizeServerGeminiModel(model);
      const ai = getGeminiClient();
      let response;
      let finalModel = targetModel;

      try {
        response = await ai.models.generateContent({
          model: targetModel,
          contents: prompt,
        });
      } catch (firstErr: any) {
        const errStr = String(firstErr?.message || '');
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
              console.warn(`[Gemini Server] Fallback ${fallbackModel} failed:`, fallbackErr?.message);
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
      let errorMessage = err?.message || 'Failed to generate analysis';
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
      const statusCode = err?.status || (typeof err?.code === 'number' && err.code >= 400 && err.code < 600 ? err.code : 500);
      res.status(statusCode).json({
        error: errorMessage,
        details: err?.error || err,
      });
    }
  });

  // Canvas API proxy to bypass browser CORS restrictions in both dev and production
  app.all(
    '/api/proxy',
    createCanvasProxyHandler({
      fetchImpl: options.proxyFetchImpl,
      corsProxyKey: options.corsProxyKey,
    })
  );
}
