import {
  createMockDatastoreBackend,
  VelmMockDatastoreV1Schema,
  type LlmProviderConfig,
  type VelmBackend,
  type VelmBackendMeta,
} from '@velm/core';

declare global {
  interface Window {
    __VELM_BACKEND__?: VelmBackend;
  }
}

const LLM_CONFIG_STORAGE_KEY = 'velm_llm_provider_config_v1';
const LLM_MINIMIZE_DATA_KEY = 'velm_llm_minimize_student_data_v1';

let overrideBackend: VelmBackend | null | undefined;
let cachedBackendMeta: VelmBackendMeta | null = null;
let fetchBridgeInstalled = false;

/**
 * Return the injected local VelmBackend (Electron preload or MV3 extension),
 * or null when running in hosted web mode.
 */
export function getLocalBackend(): VelmBackend | null {
  if (overrideBackend !== undefined) {
    return overrideBackend;
  }
  if (typeof window !== 'undefined' && window.__VELM_BACKEND__) {
    return window.__VELM_BACKEND__;
  }
  return null;
}

/**
 * Programmatically register or clear the local backend (used by extension entry point and unit tests).
 */
export function setLocalBackend(backend: VelmBackend | null): void {
  overrideBackend = backend;
  cachedBackendMeta = null;
  if (typeof window !== 'undefined') {
    if (backend) {
      window.__VELM_BACKEND__ = backend;
      void backend.getMeta().then((meta) => {
        if (getLocalBackend() === backend) {
          cachedBackendMeta = meta;
        }
      });
    } else {
      delete window.__VELM_BACKEND__;
    }
  }
}

export function isLocalRuntime(): boolean {
  return getLocalBackend() !== null;
}

export function getCachedBackendMeta(): VelmBackendMeta | null {
  return cachedBackendMeta;
}

export async function getBackendMeta(): Promise<VelmBackendMeta | null> {
  const backend = getLocalBackend();
  if (!backend) return null;
  if (cachedBackendMeta) return cachedBackendMeta;
  const meta = await backend.getMeta();
  cachedBackendMeta = meta;
  return meta;
}

export function isExtensionRuntime(): boolean {
  return cachedBackendMeta?.platform === 'extension';
}

export function isMultiStudentSupported(): boolean {
  if (!isLocalRuntime()) return true;
  if (!cachedBackendMeta) return true;
  return cachedBackendMeta.multiStudentSupported;
}

/**
 * Parse a VelmMockDatastoreV1 JSON snapshot, mount it as the active offline VelmBackend,
 * and install the local fetch bridge so Canvas, StudentVUE, and AI all run offline.
 */
export function loadMockDatastoreJson(rawJsonText: string): {
  canvasDomain: string;
  synergyDomain: string | null;
  courseCount: number;
} {
  const parsedJson = JSON.parse(rawJsonText) as unknown;
  const store = VelmMockDatastoreV1Schema.parse(parsedJson);
  const backend = createMockDatastoreBackend(store, { platform: 'desktop', version: '1.8.0-mock' });
  installLocalBackendFetchBridge(backend);
  return {
    canvasDomain: store.canvas?.domain ?? 'mock.instructure.com',
    synergyDomain: store.synergy?.domain ?? null,
    courseCount: store.canvas?.courses.length ?? 0,
  };
}

export interface LocalTransientSynergySession {
  readonly username: string;
  readonly password: string;
  readonly districtDomain: string;
  readonly isParent: boolean;
  readonly accountId?: string;
  readonly reuseExistingSession?: boolean;
}

const localTransientSessions = new Map<string, LocalTransientSynergySession>();

export function registerLocalSynergySession(session: LocalTransientSynergySession): string {
  const token = `local_session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localTransientSessions.set(token, session);
  return token;
}

export function resolveLocalSynergySession(token: string): LocalTransientSynergySession | null {
  return localTransientSessions.get(token) ?? null;
}

export function getSavedLlmConfig(): LlmProviderConfig | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LLM_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LlmProviderConfig;
  } catch {
    return null;
  }
}

export function saveLlmConfig(config: LlmProviderConfig | null): void {
  if (typeof localStorage === 'undefined') return;
  if (!config) {
    localStorage.removeItem(LLM_CONFIG_STORAGE_KEY);
  } else {
    localStorage.setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }
}

export function getLlmMinimizeStudentData(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(LLM_MINIMIZE_DATA_KEY);
  return raw === null ? true : raw === 'true';
}

export function setLlmMinimizeStudentData(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LLM_MINIMIZE_DATA_KEY, enabled ? 'true' : 'false');
}

function normalizeHeaders(input?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  if (input instanceof Headers) {
    input.forEach((value, key) => {
      out[key] = value;
    });
  } else if (Array.isArray(input)) {
    for (const [key, value] of input) {
      out[key] = value;
    }
  } else {
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) out[key] = String(value);
    }
  }
  return out;
}

/**
 * Intercept same-origin `/api/proxy?url=...` and `/api/health` fetch calls when running
 * inside Electron or the MV3 extension so Canvas and health checks run 100% locally
 * with zero Express server required.
 */
export function installLocalBackendFetchBridge(backend: VelmBackend): void {
  setLocalBackend(backend);
  if (fetchBridgeInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  fetchBridgeInstalled = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const activeBackend = getLocalBackend();
    if (!activeBackend) {
      return nativeFetch(input, init);
    }

    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (urlStr === '/api/health' || urlStr.startsWith('/api/health?')) {
      const meta = await activeBackend.getMeta();
      return new Response(
        JSON.stringify({
          status: 'ok',
          version: meta.version,
          platform: meta.platform,
          multiStudentSupported: meta.multiStudentSupported,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (urlStr.startsWith('/api/proxy?')) {
      const parsed = new URL(urlStr, 'http://localhost');
      const targetUrl = parsed.searchParams.get('url');
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing "url" query parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const method = ((init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()) as
        | 'GET'
        | 'POST'
        | 'PUT'
        | 'PATCH'
        | 'DELETE'
        | 'HEAD';

      const headers = normalizeHeaders(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );

      let body: string | undefined;
      if (typeof init?.body === 'string') {
        body = init.body;
      } else if (init?.body instanceof URLSearchParams) {
        body = init.body.toString();
      }

      const proxyRes = await activeBackend.httpRequest({
        url: targetUrl,
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
      });

      return new Response(proxyRes.text, {
        status: proxyRes.status,
        headers: proxyRes.headers,
      });
    }

    return nativeFetch(input, init);
  };
}
