import { describe, expect, it } from 'vitest';
import {
  asCookieScopeId,
  createMemorySecretStore,
  type CookieScope,
  type HttpResponse,
  type HttpTransport,
} from './ports.js';
import { createLocalBackend } from './backend.js';

function makeResp(body: string, url: string, status = 200): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: { get: () => null },
    async text() {
      return body;
    },
    async bytes() {
      return Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff);
    },
  };
}

describe('createLocalBackend', () => {
  it('wires meta, secrets, cookie scopes, httpRequest, and llm presets per platform', async () => {
    const acquired: string[] = [];
    const released: string[] = [];
    const cookieScope: CookieScope = {
      async acquire(accountId) {
        acquired.push(accountId);
        return {
          id: asCookieScopeId(`scope:${accountId}`),
          async release() {
            released.push(accountId);
          },
        };
      },
    };

    const seenScopes: Array<string | undefined> = [];
    const transport: HttpTransport = {
      async request(req) {
        seenScopes.push(req.scope);
        return makeResp('{"ok":true}', req.url, 200);
      },
    };

    const desktop = createLocalBackend({
      version: '1.8.0',
      platform: 'desktop',
      transport,
      secretStore: createMemorySecretStore(),
      cookieScope,
    });

    expect(await desktop.getMeta()).toEqual({
      version: '1.8.0',
      platform: 'desktop',
      multiStudentSupported: true,
    });

    expect(await desktop.secrets.has('llm:openai')).toBe(false);
    await desktop.secrets.set('llm:openai', 'sk-test');
    expect(await desktop.secrets.has('llm:openai')).toBe(true);
    await desktop.secrets.del('llm:openai');
    expect(await desktop.secrets.has('llm:openai')).toBe(false);

    const res = await desktop.httpRequest({
      url: 'https://school.instructure.com/api/v1/courses',
      method: 'GET',
      accountId: 'student-1',
    });
    expect(res.ok).toBe(true);
    expect(acquired).toEqual(['student-1']);
    expect(released).toEqual(['student-1']);
    expect(seenScopes).toEqual(['scope:student-1']);

    const ext = createLocalBackend({
      version: '1.8.0',
      platform: 'extension',
      transport,
      secretStore: createMemorySecretStore(),
    });
    expect((await ext.getMeta()).multiStudentSupported).toBe(false);
    expect(await ext.llm.discoverLocal()).toEqual([]);
  });
});
