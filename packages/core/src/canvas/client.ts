import { err, isErr, ok, type Result } from '@velm/shared';
import type { CancelSignal, CookieScopeId, HttpHeaders, HttpTransport } from '../ports.js';

export type CanvasErrorCode =
  | 'INVALID_DOMAIN'
  | 'AUTH_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'HTTP_ERROR';

export interface CanvasFailure {
  readonly code: CanvasErrorCode;
  readonly status?: number;
  readonly message: string;
}

export interface CanvasClientOptions {
  readonly domain: string;
  /**
   * Canvas Personal Access Token. May be omitted in extension cookie-session mode.
   */
  readonly token?: string;
  readonly transport: HttpTransport;
  readonly cookieScope?: CookieScopeId;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

export interface CanvasRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  readonly includeAuth?: boolean;
  readonly signal?: CancelSignal;
}

export interface CanvasPageResponse<T> {
  readonly status: number;
  readonly data: T;
  readonly nextUrl: string | null;
  readonly headers: HttpHeaders;
}

export function sanitizeCanvasDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

export function sanitizeCanvasToken(raw: string): string {
  return raw.replace(/[\r\n\t\s]+/g, '').trim();
}

/**
 * Extract the `rel="next"` URL from a Canvas HTTP `Link` pagination header.
 */
export function parseCanvasNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel=["']?next["']?/i.exec(part.trim());
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function classifyCanvasStatus(status: number, bodySnippet: string): CanvasFailure {
  const message = bodySnippet.slice(0, 240) || `Canvas returned HTTP ${status}`;
  if (status === 401) return { code: 'AUTH_FAILED', status, message };
  if (status === 403) return { code: 'FORBIDDEN', status, message };
  if (status === 404) return { code: 'NOT_FOUND', status, message };
  if (status === 429) return { code: 'RATE_LIMITED', status, message };
  return { code: 'HTTP_ERROR', status, message };
}

/**
 * Pure TypeScript Canvas REST client backed by an injected HttpTransport.
 * Eliminates the need for /api/proxy or corsproxy.io in desktop and extension builds.
 */
export class CanvasHttpClient {
  readonly domain: string;
  private readonly token: string;
  private readonly transport: HttpTransport;
  private readonly cookieScope: CookieScopeId | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: CanvasClientOptions) {
    const clean = sanitizeCanvasDomain(options.domain);
    if (!clean || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(clean)) {
      throw new Error(`Invalid Canvas domain: ${options.domain}`);
    }
    this.domain = clean;
    this.token = options.token ? sanitizeCanvasToken(options.token) : '';
    this.transport = options.transport;
    this.cookieScope = options.cookieScope;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }
    const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `https://${this.domain}${cleanPath}`;
  }

  async requestJson<T = unknown>(
    pathOrUrl: string,
    options: CanvasRequestOptions = {}
  ): Promise<Result<CanvasPageResponse<T>, CanvasFailure>> {
    const url = this.resolveUrl(pathOrUrl);
    const method = options.method ?? 'GET';
    const includeAuth = options.includeAuth ?? true;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    };
    if (includeAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let attempt = 0;
    while (true) {
      try {
        const res = await this.transport.request({
          url,
          method,
          headers,
          ...(options.body !== undefined ? { body: options.body } : {}),
          ...(this.cookieScope !== undefined ? { scope: this.cookieScope } : {}),
          timeoutMs: this.timeoutMs,
          ...(options.signal ? { signal: options.signal } : {}),
        });

        const text = await res.text();
        if (!res.ok) {
          if ((res.status === 429 || res.status === 502 || res.status === 503) && attempt < this.maxRetries) {
            attempt += 1;
            continue;
          }
          return err(classifyCanvasStatus(res.status, text));
        }

        const nextUrl = parseCanvasNextLink(res.headers.get('link'));
        if (!text.trim()) {
          return ok({ status: res.status, data: null as T, nextUrl, headers: res.headers });
        }

        try {
          const data = JSON.parse(text) as T;
          return ok({ status: res.status, data, nextUrl, headers: res.headers });
        } catch (parseErr) {
          return err({
            code: 'PARSE_ERROR',
            status: res.status,
            message: parseErr instanceof Error ? parseErr.message : 'Invalid JSON from Canvas',
          });
        }
      } catch (caught) {
        if (attempt < this.maxRetries) {
          attempt += 1;
          continue;
        }
        return err({
          code: 'NETWORK_ERROR',
          message: caught instanceof Error ? caught.message : String(caught),
        });
      }
    }
  }

  /**
   * Follow Canvas `Link: rel="next"` pagination headers and concatenate array pages.
   */
  async requestPaginated<T>(
    pathOrUrl: string,
    options: CanvasRequestOptions & { readonly maxPages?: number } = {}
  ): Promise<Result<T[], CanvasFailure>> {
    const maxPages = options.maxPages ?? 25;
    const items: T[] = [];
    let currentUrl: string | null = pathOrUrl;
    let pages = 0;

    while (currentUrl && pages < maxPages) {
      const pageRes: Result<CanvasPageResponse<T[]>, CanvasFailure> = await this.requestJson<T[]>(
        currentUrl,
        options
      );
      if (isErr(pageRes)) {
        return pageRes;
      }
      if (Array.isArray(pageRes.data.data)) {
        items.push(...pageRes.data.data);
      }
      currentUrl = pageRes.data.nextUrl;
      pages += 1;
    }

    return ok(items);
  }

  /**
   * Download raw text (e.g. saved workspace JSON files), retrying without Authorization
   * if a signed external storage URL rejects the Canvas Bearer header.
   */
  async downloadText(url: string, signal?: CancelSignal): Promise<Result<string, CanvasFailure>> {
    const resolved = this.resolveUrl(url);
    const tryDownload = async (withAuth: boolean) => {
      const headers: Record<string, string> = {};
      if (withAuth && this.token) headers['Authorization'] = `Bearer ${this.token}`;
      return this.transport.request({
        url: resolved,
        method: 'GET',
        headers,
        ...(this.cookieScope !== undefined ? { scope: this.cookieScope } : {}),
        timeoutMs: this.timeoutMs,
        ...(signal ? { signal } : {}),
      });
    };

    try {
      const first = await tryDownload(true);
      if (first.ok) {
        return ok(await first.text());
      }
      if ((first.status === 400 || first.status === 401 || first.status === 403) && this.token) {
        const second = await tryDownload(false);
        if (second.ok) {
          return ok(await second.text());
        }
        return err(classifyCanvasStatus(second.status, await second.text()));
      }
      return err(classifyCanvasStatus(first.status, await first.text()));
    } catch (caught) {
      return err({
        code: 'NETWORK_ERROR',
        message: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }
}
