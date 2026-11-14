// @vitest-environment node
import http from 'http';
import express from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerApiRoutes, sanitizeServerGeminiModel } from '../../utils/apiRoutes';

interface RunningServer {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startTestServer(options: Parameters<typeof registerApiRoutes>[1] = {}): Promise<RunningServer> {
  const app = express();
  registerApiRoutes(app, {
    version: '1.8.0-test',
    buildTimestamp: '2026-11-13T12:00:00.000Z',
    ...options,
  });

  const server = http.createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind ephemeral server address');
  }
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}

describe('Express API routes (/api/health, /api/proxy, /api/gemini/analyze)', () => {
  const servers: RunningServer[] = [];

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.API_KEY;
  });

  afterEach(async () => {
    while (servers.length > 0) {
      const s = servers.pop()!;
      await s.close();
    }
  });

  it('serves /api/health with status, version, and buildTimestamp', async () => {
    const srv = await startTestServer();
    servers.push(srv);

    const res = await fetch(`${srv.baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      status: 'ok',
      version: '1.8.0-test',
      buildTimestamp: '2026-11-13T12:00:00.000Z',
    });
  });

  it('enforces /api/proxy OPTIONS preflight, missing query 400, SSRF blocking 403, header allowlist, and corsproxy key injection', async () => {
    const upstreamMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Upstream': 'canvas' },
      });
    }) as unknown as typeof fetch;

    const srv = await startTestServer({
      proxyFetchImpl: upstreamMock,
      corsProxyKey: 'secret-cors-key',
    });
    servers.push(srv);

    const optionsRes = await fetch(`${srv.baseUrl}/api/proxy`, { method: 'OPTIONS' });
    expect(optionsRes.status).toBe(204);

    const missingUrlRes = await fetch(`${srv.baseUrl}/api/proxy`);
    expect(missingUrlRes.status).toBe(400);

    const ssrfRes = await fetch(`${srv.baseUrl}/api/proxy?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`);
    expect(ssrfRes.status).toBe(403);
    expect(upstreamMock).not.toHaveBeenCalled();

    const forwardRes = await fetch(
      `${srv.baseUrl}/api/proxy?url=${encodeURIComponent('https://corsproxy.io/?https://mcpsmd.instructure.com/api/v1/courses')}`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-tok',
          'Content-Type': 'application/json',
          Cookie: 'session=secret',
          Origin: 'https://evil.example',
          Referer: 'https://evil.example/page',
          'X-Forwarded-For': '1.2.3.4',
        },
        body: JSON.stringify({ hello: 'world' }),
      }
    );

    expect(forwardRes.status).toBe(200);
    expect(await forwardRes.json()).toEqual({ ok: true });
    expect(upstreamMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = (upstreamMock as any).mock.calls[0];
    expect(String(calledUrl)).toContain('key=secret-cors-key');
    const forwardedHeaders = Object.fromEntries(
      Object.entries(calledInit.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])
    );
    expect(forwardedHeaders['authorization']).toBe('Bearer test-tok');
    expect(forwardedHeaders['content-type']).toBe('application/json');
    expect(forwardedHeaders['user-agent']).toBe('Velm-Canvas-Proxy/1.0');
    expect(forwardedHeaders['cookie']).toBeUndefined();
    expect(forwardedHeaders['origin']).toBeUndefined();
    expect(forwardedHeaders['referer']).toBeUndefined();
    expect(forwardedHeaders['x-forwarded-for']).toBeUndefined();
  });

  it('validates /api/gemini/analyze prompts, sanitizes legacy models, and retries 503 via fallback models', async () => {
    expect(sanitizeServerGeminiModel('gemini-2.0-flash')).toBe('gemini-3.8-flash');
    expect(sanitizeServerGeminiModel('gemini-pro')).toBe('gemini-3.8-flash');
    expect(sanitizeServerGeminiModel('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview');

    // No API key configured -> 500
    const noKeySrv = await startTestServer();
    servers.push(noKeySrv);

    const missingPromptRes = await fetch(`${noKeySrv.baseUrl}/api/gemini/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingPromptRes.status).toBe(400);

    const missingKeyRes = await fetch(`${noKeySrv.baseUrl}/api/gemini/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Analyze workload' }),
    });
    expect(missingKeyRes.status).toBe(500);

    // Mocked Gemini client: 503 on sanitized primary model triggers fallback model retry
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE'))
      .mockResolvedValueOnce({ text: '<p>Prioritize Problem Set 1</p>' });

    const mockSrv = await startTestServer({
      geminiClientFactory: () => ({ models: { generateContent } } as any),
    });
    servers.push(mockSrv);

    const okRes = await fetch(`${mockSrv.baseUrl}/api/gemini/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Summarize assignments', model: 'gemini-2.0-flash' }),
    });
    expect(okRes.status).toBe(200);
    const body = await okRes.json();
    expect(body).toEqual({
      analysis: '<p>Prioritize Problem Set 1</p>',
      modelUsed: 'gemini-flash-latest',
    });
    expect(generateContent).toHaveBeenNthCalledWith(1, {
      model: 'gemini-3.8-flash',
      contents: 'Summarize assignments',
    });
    expect(generateContent).toHaveBeenNthCalledWith(2, {
      model: 'gemini-flash-latest',
      contents: 'Summarize assignments',
    });
  });
});
