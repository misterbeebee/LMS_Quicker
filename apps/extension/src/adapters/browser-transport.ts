import type { HttpHeaders, HttpRequest, HttpResponse, HttpTransport } from '@velm/core';

export interface BrowserTransportOptions {
  readonly fetchImpl?: typeof fetch;
  /**
   * Optional hook to ensure Chrome MV3 `optional_host_permissions` is granted for
   * the target origin before sending the request.
   */
  readonly ensureHostPermission?: (originPattern: string) => Promise<boolean>;
}

function wrapHeaders(headers: Headers): HttpHeaders {
  return {
    get(name: string): string | null {
      return headers.get(name);
    },
    forEach(callback: (value: string, key: string) => void): void {
      headers.forEach((value, key) => callback(value, key));
    },
  };
}

/**
 * Browser/Extension HttpTransport using native `fetch` with `credentials: 'include'`.
 * Inside a Chrome MV3 extension page with host permission, this bypasses CORS and
 * shares the active Chrome profile's cookies (enabling open-tab StudentVUE/SSO reuse).
 */
export function createBrowserHttpTransport(options: BrowserTransportOptions = {}): HttpTransport {
  const fetchFn = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      if (options.ensureHostPermission) {
        const parsed = new URL(req.url);
        if (parsed.protocol === 'https:') {
          const originPattern = `${parsed.origin}/*`;
          await options.ensureHostPermission(originPattern);
        }
      }

      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const onExternalAbort = (): void => {
        controller.abort();
      };

      if (req.signal?.aborted) {
        controller.abort();
      } else if (req.signal?.addEventListener) {
        req.signal.addEventListener('abort', onExternalAbort);
      }

      if (req.timeoutMs !== undefined && req.timeoutMs > 0) {
        timeoutHandle = setTimeout(() => controller.abort(), req.timeoutMs);
      }

      try {
        const init: RequestInit = {
          method: req.method,
          credentials: 'include',
          redirect: 'follow',
          signal: controller.signal,
        };
        if (req.headers) {
          init.headers = { ...req.headers };
        }
        if (req.body !== undefined) {
          init.body = typeof req.body === 'string' ? req.body : new Uint8Array(req.body);
        }

        const res = await fetchFn(req.url, init);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let cachedText: string | null = null;

        return {
          status: res.status,
          ok: res.ok,
          url: res.url || req.url,
          headers: wrapHeaders(res.headers),
          async text(): Promise<string> {
            if (cachedText === null) {
              cachedText = new TextDecoder('utf-8').decode(bytes);
            }
            return cachedText;
          },
          async bytes(): Promise<Uint8Array> {
            return bytes;
          },
        };
      } finally {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
        if (req.signal?.removeEventListener) {
          req.signal.removeEventListener('abort', onExternalAbort);
        }
      }
    },
  };
}
