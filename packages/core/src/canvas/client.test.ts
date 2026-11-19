import { describe, expect, it } from 'vitest';
import type { HttpRequest, HttpResponse, HttpTransport } from '../ports.js';
import {
  CanvasHttpClient,
  parseCanvasNextLink,
  sanitizeCanvasDomain,
  sanitizeCanvasToken,
} from './client.js';

function makeResp(
  body: string,
  url: string,
  status = 200,
  headersMap: Record<string, string> = {}
): HttpResponse {
  const lowerMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(headersMap)) {
    lowerMap[k.toLowerCase()] = v;
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: { get: (name) => lowerMap[name.toLowerCase()] ?? null },
    async text() {
      return body;
    },
    async bytes() {
      return Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff);
    },
  };
}

describe('CanvasHttpClient', () => {
  it('sanitizes domains, tokens, and parses Link rel=next headers', () => {
    expect(sanitizeCanvasDomain('https://MCPSMD.instructure.com/courses/1')).toBe(
      'mcpsmd.instructure.com'
    );
    expect(sanitizeCanvasToken('  abc\n123\t ')).toBe('abc123');
    expect(
      parseCanvasNextLink(
        '<https://school.instructure.com/api/v1/courses?page=2>; rel="next", <https://school.instructure.com/api/v1/courses?page=1>; rel="current"'
      )
    ).toBe('https://school.instructure.com/api/v1/courses?page=2');
    expect(parseCanvasNextLink('<https://school.instructure.com/api/v1/courses?page=1>; rel="current"')).toBeNull();
  });

  it('follows Link pagination across multiple pages with Bearer auth', async () => {
    const requests: HttpRequest[] = [];
    const transport: HttpTransport = {
      async request(req) {
        requests.push(req);
        if (req.url.endsWith('/api/v1/courses')) {
          return makeResp(JSON.stringify([{ id: 1 }, { id: 2 }]), req.url, 200, {
            Link: '<https://school.instructure.com/api/v1/courses?page=2>; rel="next"',
          });
        }
        return makeResp(JSON.stringify([{ id: 3 }]), req.url, 200);
      },
    };

    const client = new CanvasHttpClient({
      domain: 'https://school.instructure.com/',
      token: 'tok-xyz',
      transport,
    });

    const res = await client.requestPaginated<{ id: number }>('/api/v1/courses');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(requests[0]?.headers?.['Authorization']).toBe('Bearer tok-xyz');
  });

  it('retries 429 rate limits and retries signed file downloads without Authorization', async () => {
    let attempts = 0;
    const transport: HttpTransport = {
      async request(req) {
        if (req.url.includes('/api/v1/users/self')) {
          attempts += 1;
          if (attempts === 1) return makeResp('Rate limited', req.url, 429);
          return makeResp(JSON.stringify({ id: 42, name: 'Maya' }), req.url, 200);
        }
        if (req.url.includes('s3.amazonaws.com')) {
          if (req.headers?.['Authorization']) {
            return makeResp('Only one auth mechanism allowed', req.url, 400);
          }
          return makeResp('{"saved":true}', req.url, 200);
        }
        return makeResp('', req.url, 404);
      },
    };

    const client = new CanvasHttpClient({
      domain: 'school.instructure.com',
      token: 'tok-xyz',
      transport,
    });

    const userRes = await client.requestJson<{ id: number }>('/api/v1/users/self');
    expect(userRes.ok).toBe(true);
    expect(attempts).toBe(2);

    const fileRes = await client.downloadText('https://s3.amazonaws.com/bucket/save.json?sig=1');
    expect(fileRes.ok).toBe(true);
    if (fileRes.ok) {
      expect(fileRes.data).toBe('{"saved":true}');
    }
  });
});
