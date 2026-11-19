import type { CookieScopeId, HttpHeaders, HttpRequest, HttpResponse, HttpTransport } from '@velm/core';

export type PartitionFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ElectronFetchResolver {
  getFetchForScope(scope?: CookieScopeId): PartitionFetch;
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
 * Isomorphic HttpTransport backed by Electron's `net.fetch` / `session.fromPartition(scope).fetch`.
 * Automatically inherits the OS certificate store, system proxy settings, and per-account cookie jars.
 */
export function createElectronHttpTransport(resolver: ElectronFetchResolver): HttpTransport {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      const fetchImpl = resolver.getFetchForScope(req.scope);
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
          signal: controller.signal,
          redirect: 'follow',
        };
        if (req.headers) {
          init.headers = { ...req.headers };
        }
        if (req.body !== undefined) {
          init.body = typeof req.body === 'string' ? req.body : Buffer.from(req.body);
        }

        const res = await fetchImpl(req.url, init);
        const arrayBuf = await res.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
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
