import { describe, expect, it } from 'vitest';
import {
  createMemorySecretStore,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from '../ports.js';
import { LlmRouter } from './router.js';
import { sanitizePromptForCloud } from './sanitize.js';
import type { LlmProviderConfig } from './types.js';

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

describe('LlmRouter', () => {
  it('hides and blocks privacy-unfriendly keyless endpoints by default (D11), and allows them when flagged', async () => {
    const transport: HttpTransport = {
      async request(req) {
        return makeResp(
          JSON.stringify({ choices: [{ message: { content: 'public reply' } }] }),
          req.url
        );
      },
    };
    const secretStore = createMemorySecretStore();

    const defaultRouter = new LlmRouter({ transport, secretStore });
    expect(defaultRouter.listPresets('desktop').some((p) => p.id === 'pollinations-keyless')).toBe(false);
    expect(defaultRouter.listPresets('desktop').some((p) => p.id === 'ollama')).toBe(true);
    expect(defaultRouter.listPresets('extension').some((p) => p.id === 'chrome-builtin')).toBe(true);
    expect(defaultRouter.listPresets('extension').some((p) => p.id === 'ollama')).toBe(false);

    const keylessCfg: LlmProviderConfig = {
      id: 'pollinations-keyless',
      kind: 'openai-compatible',
      label: 'Pollinations',
      baseUrl: 'https://text.pollinations.ai/openai',
      auth: { type: 'none' },
      model: 'openai',
      privacy: 'unknown',
      privacyUnfriendly: true,
    };

    const blocked = await defaultRouter.generate(keylessCfg, { prompt: 'Summarize homework' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe('PROVIDER_DISABLED');
    }

    const optInRouter = new LlmRouter({
      transport,
      secretStore,
      featureFlags: { allowPrivacyUnfriendlyEndpoints: true },
    });
    expect(optInRouter.listPresets('desktop').some((p) => p.id === 'pollinations-keyless')).toBe(true);
    const allowed = await optInRouter.generate(keylessCfg, { prompt: 'Summarize homework' });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.data.text).toBe('public reply');
    }
  });

  it('discovers running local desktop LLM servers (Ollama / LM Studio)', async () => {
    const transport: HttpTransport = {
      async request(req) {
        if (req.url === 'http://127.0.0.1:11434/v1/models') {
          return makeResp(JSON.stringify({ data: [{ id: 'llama3.2' }, { id: 'qwen2.5:7b' }] }), req.url);
        }
        throw new Error('ECONNREFUSED');
      },
    };
    const router = new LlmRouter({ transport, secretStore: createMemorySecretStore() });
    const discovered = await router.discoverLocal(500);
    expect(discovered).toEqual([
      {
        presetId: 'ollama',
        label: 'Ollama (Local)',
        baseUrl: 'http://127.0.0.1:11434/v1',
        models: ['llama3.2', 'qwen2.5:7b'],
      },
    ]);
  });

  it('routes Gemini with 503 fallback and redacts student PII when minimizeStudentData is enabled', async () => {
    const requests: HttpRequest[] = [];
    const transport: HttpTransport = {
      async request(req) {
        requests.push(req);
        if (req.url.includes('gemini-2.5-flash:generateContent')) {
          return makeResp(
            JSON.stringify({ error: { message: 'Model currently experiencing high demand' } }),
            req.url,
            503
          );
        }
        return makeResp(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Focus on Chemistry quiz first.' }] } }],
          }),
          req.url,
          200
        );
      },
    };

    const secretStore = createMemorySecretStore();
    await secretStore.set('llm:gemini', 'AIza-test-key');
    const router = new LlmRouter({ transport, secretStore });

    const cfg: LlmProviderConfig = {
      id: 'gemini',
      kind: 'gemini',
      label: 'Google Gemini',
      auth: { type: 'apiKey', secretRef: 'llm:gemini' },
      model: 'gemini-2.5-flash',
      fallbackModels: ['gemini-flash-latest'],
      privacy: 'free-tier-may-train',
    };

    const res = await router.generate(cfg, {
      prompt: 'Student Maya Lin (551122, maya@school.edu) has a Chemistry quiz tomorrow.',
      minimizeStudentData: true,
      studentIdentifiersToRedact: ['Maya Lin', '551122'],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.modelUsed).toBe('gemini-flash-latest');
    expect(res.data.text).toBe('Focus on Chemistry quiz first.');
    expect(res.data.redactedCount).toBe(3);

    const sentBody = String(requests[1]?.body ?? '');
    expect(sentBody).not.toContain('Maya Lin');
    expect(sentBody).not.toContain('551122');
    expect(sentBody).not.toContain('maya@school.edu');
    expect(sentBody).toContain('[REDACTED]');
    expect(sentBody).toContain('[REDACTED_EMAIL]');
  });

  it('routes Anthropic and Chrome Built-in AI adapters cleanly', async () => {
    const transport: HttpTransport = {
      async request(req) {
        if (req.url.endsWith('/messages')) {
          expect(req.headers?.['x-api-key']).toBe('sk-ant-test');
          return makeResp(
            JSON.stringify({ content: [{ type: 'text', text: 'Anthropic analysis' }] }),
            req.url
          );
        }
        return makeResp('', req.url, 404);
      },
    };
    const secretStore = createMemorySecretStore();
    await secretStore.set('llm:anthropic', 'sk-ant-test');

    const router = new LlmRouter({
      transport,
      secretStore,
      chromeBuiltin: {
        isAvailable: async () => true,
        generate: async (prompt) => `Nano: ${prompt}`,
      },
    });

    const antRes = await router.generate(
      {
        id: 'anthropic',
        kind: 'anthropic',
        label: 'Anthropic',
        auth: { type: 'apiKey', secretRef: 'llm:anthropic' },
        model: 'claude-3-5-haiku-latest',
        privacy: 'paid-no-training',
      },
      { prompt: 'Hello Claude' }
    );
    expect(antRes.ok).toBe(true);
    if (antRes.ok) expect(antRes.data.text).toBe('Anthropic analysis');

    const nanoRes = await router.generate(
      {
        id: 'chrome-builtin',
        kind: 'chrome-builtin',
        label: 'Chrome Built-in AI',
        auth: { type: 'none' },
        model: 'gemini-nano',
        privacy: 'local',
      },
      { prompt: 'Keep Maya Lin local', minimizeStudentData: true, studentIdentifiersToRedact: ['Maya Lin'] }
    );
    expect(nanoRes.ok).toBe(true);
    if (nanoRes.ok) {
      // Local provider does not unnecessarily redact
      expect(nanoRes.data.redactedCount).toBe(0);
      expect(nanoRes.data.text).toBe('Nano: Keep Maya Lin local');
    }
  });

  it('sanitizes full names before short tokens', () => {
    const res = sanitizePromptForCloud('Maya Lin and Maya submitted work.', ['Maya', 'Maya Lin']);
    expect(res.text).toBe('[REDACTED] and [REDACTED] submitted work.');
    expect(res.redactedCount).toBe(2);
  });
});
