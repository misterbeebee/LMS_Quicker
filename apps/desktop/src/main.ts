import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, net, safeStorage, session, shell } from 'electron';
import { createLocalBackend, type CookieScopeId } from '@velm/core';
import { createElectronCookieScope } from './adapters/cookie-scope.js';
import { createElectronHttpTransport } from './adapters/electron-transport.js';
import { createSafeStorageSecretStore } from './adapters/safe-storage.js';
import { registerVelmIpcHandlers } from './ipc.js';

const APP_VERSION = app.getVersion() || '1.8.0';

function resolveRendererEntry(): { type: 'url'; value: string } | { type: 'file'; value: string } {
  const devUrl = process.env['VELM_DEV_SERVER_URL'];
  if (devUrl) {
    return { type: 'url', value: devUrl };
  }
  const packagedHtml = path.join(__dirname, '..', 'renderer', 'index.html');
  if (fs.existsSync(packagedHtml)) {
    return { type: 'file', value: packagedHtml };
  }
  const monorepoHtml = path.resolve(__dirname, '..', '..', 'web', 'dist', 'index.html');
  return { type: 'file', value: monorepoHtml };
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'Velm — Local Academic Dashboard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Open external links in the OS default browser, never inside an unsandboxed Electron popup.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const entry = resolveRendererEntry();
  if (entry.type === 'url') {
    void win.loadURL(entry.value);
  } else {
    void win.loadFile(entry.value);
  }

  return win;
}

function installStrictCsp(): void {
  const isDev = Boolean(process.env['VELM_DEV_SERVER_URL']);
  if (isDev) return;

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    installStrictCsp();

    const transport = createElectronHttpTransport({
      getFetchForScope(scope?: CookieScopeId) {
        if (scope) {
          const ses = session.fromPartition(scope);
          return (input, init) => ses.fetch(input, init);
        }
        return (input, init) => net.fetch(input, init);
      },
    });

    const secretsPath = path.join(app.getPath('userData'), 'velm-secrets.v1.json');
    const secretStore = createSafeStorageSecretStore(secretsPath, safeStorage);
    const cookieScope = createElectronCookieScope();

    const backend = createLocalBackend({
      version: APP_VERSION,
      platform: 'desktop',
      transport,
      secretStore,
      cookieScope,
    });

    registerVelmIpcHandlers(ipcMain, backend);
    mainWindow = createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
