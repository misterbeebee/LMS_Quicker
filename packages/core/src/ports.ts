/**
 * Dependency-injected platform ports for @velm/core.
 *
 * All interfaces here are strictly isomorphic (no DOM or Node-specific types)
 * so @velm/core runs identically in Electron main/utilityProcess, MV3 extension
 * pages/service workers, and Node.
 */

export type CookieScopeId = string & { readonly __brand: 'CookieScopeId' };

export interface CancelSignal {
  readonly aborted: boolean;
  addEventListener?(type: 'abort', listener: () => void): void;
  removeEventListener?(type: 'abort', listener: () => void): void;
}

export interface HttpHeaders {
  get(name: string): string | null;
  forEach?(callback: (value: string, key: string) => void): void;
}

export interface HttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  readonly scope?: CookieScopeId;
  readonly timeoutMs?: number;
  readonly signal?: CancelSignal;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly url: string;
  readonly headers: HttpHeaders;
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
}

export interface HttpTransport {
  request(req: HttpRequest): Promise<HttpResponse>;
}

export interface CookieScopeLease {
  readonly id: CookieScopeId;
  release(): Promise<void>;
}

export interface CookieScope {
  acquire(accountId: string): Promise<CookieScopeLease>;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export interface KvStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys?(prefix?: string): Promise<string[]>;
}

export interface Clock {
  now(): number;
  isoNow(): string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function createMemorySecretStore(): SecretStore {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async del(key) {
      map.delete(key);
    },
  };
}

export function createMemoryKvStore(): KvStore {
  const map = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string) {
      return (map.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown) {
      map.set(key, value);
    },
    async del(key: string) {
      map.delete(key);
    },
    async keys(prefix?: string) {
      const all = Array.from(map.keys());
      return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
    },
  };
}

export function asCookieScopeId(raw: string): CookieScopeId {
  return raw as CookieScopeId;
}
