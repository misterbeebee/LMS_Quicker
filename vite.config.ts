import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createCanvasProxyHandler } from './utils/proxyHandler';

const pkgJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const APP_VERSION: string = pkgJson.version || '1.8.0';
const BUILD_TIMESTAMP: string = new Date().toISOString();

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxyMiddleware = createCanvasProxyHandler({
    corsProxyKey: env.CORS_PROXY_KEY || env.VITE_CORSPROXY_KEY,
  });

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
          server.middlewares.use('/api/proxy', proxyMiddleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use('/api/proxy', proxyMiddleware);
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      '__APP_VERSION__': JSON.stringify(APP_VERSION),
      '__BUILD_TIMESTAMP__': JSON.stringify(BUILD_TIMESTAMP),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
