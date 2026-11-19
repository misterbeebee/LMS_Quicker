import { err, isErr, isOk, ok, type Result } from '@velm/shared';
import type { HttpTransport, SecretStore } from '../ports.js';
import { LLM_PROVIDER_PRESETS } from './presets.js';
import { sanitizeGeminiModel, sanitizePromptForCloud } from './sanitize.js';
import {
  LlmProviderConfigSchema,
  type ChromeBuiltinAdapter,
  type DiscoveredLocalProvider,
  type LlmFailure,
  type LlmFeatureFlags,
  type LlmGenerateRequest,
  type LlmGenerateResponse,
  type LlmProviderConfig,
  type PlatformTarget,
  type ProviderPreset,
} from './types.js';

export interface LlmRouterOptions {
  readonly transport: HttpTransport;
  readonly secretStore: SecretStore;
  readonly featureFlags?: LlmFeatureFlags;
  readonly chromeBuiltin?: ChromeBuiltinAdapter;
  readonly timeoutMs?: number;
}

function isRetryableModelFailure(status: number, bodyText: string): boolean {
  if (status === 404 || status === 503) return true;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes('unavailable') ||
    lower.includes('not_found') ||
    lower.includes('high demand') ||
    lower.includes('model_not_found')
  );
}

export class LlmRouter {
  private readonly transport: HttpTransport;
  private readonly secretStore: SecretStore;
  private readonly allowPrivacyUnfriendly: boolean;
  private readonly chromeBuiltin: ChromeBuiltinAdapter | undefined;
  private readonly timeoutMs: number;

  constructor(options: LlmRouterOptions) {
    this.transport = options.transport;
    this.secretStore = options.secretStore;
    this.allowPrivacyUnfriendly = Boolean(options.featureFlags?.allowPrivacyUnfriendlyEndpoints);
    this.chromeBuiltin = options.chromeBuiltin;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  listPresets(platform: PlatformTarget): ProviderPreset[] {
    return LLM_PROVIDER_PRESETS.filter((preset) => {
      if (!preset.platforms.includes(platform)) return false;
      if (preset.disabledByDefault && !this.allowPrivacyUnfriendly) return false;
      return true;
    });
  }

  /**
   * Probe well-known localhost LLM server ports (desktop only).
   * Returns only servers that respond 200 OK with an OpenAI-compatible /v1/models list.
   */
  async discoverLocal(probeTimeoutMs = 1_500): Promise<DiscoveredLocalProvider[]> {
    const localPresets = LLM_PROVIDER_PRESETS.filter(
      (p) => p.group === 'local-server' && Boolean(p.localProbeUrl) && Boolean(p.baseUrl)
    );

    const results = await Promise.all(
      localPresets.map(async (preset): Promise<DiscoveredLocalProvider | null> => {
        try {
          const res = await this.transport.request({
            url: preset.localProbeUrl!,
            method: 'GET',
            timeoutMs: probeTimeoutMs,
          });
          if (!res.ok) return null;
          const json = JSON.parse(await res.text()) as { data?: Array<{ id?: string }> };
          const models = Array.isArray(json?.data)
            ? json.data
                .map((m) => (typeof m?.id === 'string' ? m.id : ''))
                .filter((id) => id.length > 0)
            : [];
          return {
            presetId: preset.id,
            label: preset.label,
            baseUrl: preset.baseUrl!,
            models,
          };
        } catch {
          return null;
        }
      })
    );

    return results.filter((item): item is DiscoveredLocalProvider => item !== null);
  }

  private async resolveSecret(config: LlmProviderConfig): Promise<Result<string | null, LlmFailure>> {
    if (config.auth.type === 'none') return ok(null);
    const val = await this.secretStore.get(config.auth.secretRef);
    if (!val || !val.trim()) {
      return err({
        code: 'MISSING_CREDENTIALS',
        message: `Missing credentials for ${config.label} (secretRef: ${config.auth.secretRef}).`,
        retryable: false,
      });
    }
    return ok(val.trim());
  }

  async test(rawConfig: LlmProviderConfig): Promise<Result<{ readonly models: string[] }, LlmFailure>> {
    const parsed = LlmProviderConfigSchema.safeParse(rawConfig);
    if (!parsed.success) {
      return err({
        code: 'INVALID_CONFIG',
        message: parsed.error.issues.map((i) => i.message).join('; '),
        retryable: false,
      });
    }
    const config = parsed.data;
    if (config.privacyUnfriendly && !this.allowPrivacyUnfriendly) {
      return err({
        code: 'PROVIDER_DISABLED',
        message: `${config.label} is disabled by default for student privacy.`,
        retryable: false,
      });
    }

    if (config.kind === 'chrome-builtin') {
      if (!this.chromeBuiltin) {
        return err({
          code: 'UNSUPPORTED_PLATFORM',
          message: 'Chrome Built-in AI is only available inside the Chrome extension.',
          retryable: false,
        });
      }
      const available = await this.chromeBuiltin.isAvailable();
      return available
        ? ok({ models: ['gemini-nano'] })
        : err({
            code: 'UNSUPPORTED_PLATFORM',
            message: 'Chrome Built-in AI (Gemini Nano) is not available on this device.',
            retryable: false,
          });
    }

    const secretRes = await this.resolveSecret(config);
    if (isErr(secretRes)) return secretRes;

    try {
      if (config.kind === 'openai-compatible') {
        const base = (config.baseUrl ?? '').replace(/\/+$/, '');
        if (!base) {
          return err({ code: 'INVALID_CONFIG', message: 'Missing baseUrl', retryable: false });
        }
        const headers: Record<string, string> = {};
        if (secretRes.data) {
          headers['Authorization'] = `Bearer ${secretRes.data}`;
        }
        const res = await this.transport.request({
          url: `${base}/models`,
          method: 'GET',
          headers,
          timeoutMs: 10_000,
        });
        if (res.status === 401 || res.status === 403) {
          return err({ code: 'AUTH_FAILED', message: `Authentication failed (HTTP ${res.status})`, retryable: false });
        }
        if (!res.ok) {
          return err({ code: 'PROVIDER_ERROR', message: `Provider returned HTTP ${res.status}`, retryable: true });
        }
        const json = JSON.parse(await res.text()) as { data?: Array<{ id?: string }> };
        const models = Array.isArray(json?.data)
          ? json.data.map((m) => m?.id ?? '').filter(Boolean)
          : [config.model];
        return ok({ models });
      }

      if (config.kind === 'gemini') {
        const base = (config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
        const res = await this.transport.request({
          url: `${base}/models?key=${encodeURIComponent(secretRes.data ?? '')}`,
          method: 'GET',
          timeoutMs: 10_000,
        });
        if (res.status === 401 || res.status === 403) {
          return err({ code: 'AUTH_FAILED', message: `Gemini API key rejected (HTTP ${res.status})`, retryable: false });
        }
        if (!res.ok) {
          return err({ code: 'PROVIDER_ERROR', message: `Gemini returned HTTP ${res.status}`, retryable: true });
        }
        const json = JSON.parse(await res.text()) as { models?: Array<{ name?: string }> };
        const models = Array.isArray(json?.models)
          ? json.models.map((m) => (m?.name ?? '').replace(/^models\//, '')).filter(Boolean)
          : [config.model];
        return ok({ models });
      }

      // Anthropic: validate key against /v1/models
      const base = (config.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
      const res = await this.transport.request({
        url: `${base}/models`,
        method: 'GET',
        headers: {
          'x-api-key': secretRes.data ?? '',
          'anthropic-version': '2023-06-01',
        },
        timeoutMs: 10_000,
      });
      if (res.status === 401 || res.status === 403) {
        return err({ code: 'AUTH_FAILED', message: `Anthropic API key rejected (HTTP ${res.status})`, retryable: false });
      }
      if (!res.ok) {
        return err({ code: 'PROVIDER_ERROR', message: `Anthropic returned HTTP ${res.status}`, retryable: true });
      }
      const json = JSON.parse(await res.text()) as { data?: Array<{ id?: string }> };
      const models = Array.isArray(json?.data)
        ? json.data.map((m) => m?.id ?? '').filter(Boolean)
        : [config.model];
      return ok({ models });
    } catch (caught) {
      return err({
        code: 'NETWORK_ERROR',
        message: caught instanceof Error ? caught.message : String(caught),
        retryable: true,
      });
    }
  }

  async generate(
    rawConfig: LlmProviderConfig,
    req: LlmGenerateRequest
  ): Promise<Result<LlmGenerateResponse, LlmFailure>> {
    const parsed = LlmProviderConfigSchema.safeParse(rawConfig);
    if (!parsed.success) {
      return err({
        code: 'INVALID_CONFIG',
        message: parsed.error.issues.map((i) => i.message).join('; '),
        retryable: false,
      });
    }
    const config = parsed.data;

    if (config.privacyUnfriendly && !this.allowPrivacyUnfriendly) {
      return err({
        code: 'PROVIDER_DISABLED',
        message: `${config.label} is disabled by default for student privacy.`,
        retryable: false,
      });
    }

    let promptText = req.prompt;
    let redactedCount = 0;
    if (req.minimizeStudentData && config.privacy !== 'local') {
      const sanitized = sanitizePromptForCloud(promptText, req.studentIdentifiersToRedact ?? []);
      promptText = sanitized.text;
      redactedCount = sanitized.redactedCount;
    }

    if (config.kind === 'chrome-builtin') {
      if (!this.chromeBuiltin) {
        return err({
          code: 'UNSUPPORTED_PLATFORM',
          message: 'Chrome Built-in AI is not available on this platform.',
          retryable: false,
        });
      }
      try {
        const text = await this.chromeBuiltin.generate(promptText, req.system);
        return ok({
          text,
          modelUsed: 'gemini-nano',
          providerId: config.id,
          privacy: config.privacy,
          redactedCount,
        });
      } catch (caught) {
        return err({
          code: 'PROVIDER_ERROR',
          message: caught instanceof Error ? caught.message : String(caught),
          retryable: false,
        });
      }
    }

    const secretRes = await this.resolveSecret(config);
    if (isErr(secretRes)) return secretRes;

    const primaryModel =
      config.kind === 'gemini'
        ? sanitizeGeminiModel(req.modelOverride ?? config.model)
        : (req.modelOverride ?? config.model);
    const candidateModels = [
      primaryModel,
      ...(config.fallbackModels ?? []).filter((m) => m !== primaryModel),
    ];

    let lastFailure: LlmFailure = {
      code: 'PROVIDER_ERROR',
      message: 'No candidate models available.',
      retryable: false,
    };

    for (const model of candidateModels) {
      const attempt = await this.callSingleModel(
        config,
        model,
        secretRes.data,
        promptText,
        req.system,
        req.signal
      );
      if (isOk(attempt)) {
        return ok({
          text: attempt.data,
          modelUsed: model,
          providerId: config.id,
          privacy: config.privacy,
          redactedCount,
        });
      }
      lastFailure = attempt.error;
      if (attempt.error.code !== 'MODEL_UNAVAILABLE') {
        return err(attempt.error);
      }
    }

    return err(lastFailure);
  }

  private async callSingleModel(
    config: LlmProviderConfig,
    model: string,
    secret: string | null,
    prompt: string,
    system: string | undefined,
    signal: LlmGenerateRequest['signal']
  ): Promise<Result<string, LlmFailure>> {
    try {
      if (config.kind === 'openai-compatible') {
        const base = (config.baseUrl ?? '').replace(/\/+$/, '');
        if (!base) {
          return err({ code: 'INVALID_CONFIG', message: 'Missing baseUrl', retryable: false });
        }
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (secret) {
          headers['Authorization'] = `Bearer ${secret}`;
        }
        const messages: Array<{ role: string; content: string }> = [];
        if (system) messages.push({ role: 'system', content: system });
        messages.push({ role: 'user', content: prompt });

        const res = await this.transport.request({
          url: `${base}/chat/completions`,
          method: 'POST',
          headers,
          body: JSON.stringify({ model, messages }),
          timeoutMs: this.timeoutMs,
          ...(signal ? { signal } : {}),
        });
        const bodyText = await res.text();
        if (!res.ok) return this.classifyHttpFailure(res.status, bodyText);
        const json = JSON.parse(bodyText) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = json?.choices?.[0]?.message?.content;
        return ok(typeof text === 'string' && text.length > 0 ? text : 'No analysis generated.');
      }

      if (config.kind === 'gemini') {
        const base = (config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
        const payload: Record<string, unknown> = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        };
        if (system) {
          payload['systemInstruction'] = { parts: [{ text: system }] };
        }
        const res = await this.transport.request({
          url: `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(secret ?? '')}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          timeoutMs: this.timeoutMs,
          ...(signal ? { signal } : {}),
        });
        const bodyText = await res.text();
        if (!res.ok) return this.classifyHttpFailure(res.status, bodyText);
        const json = JSON.parse(bodyText) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = json?.candidates?.[0]?.content?.parts
          ?.map((p) => p?.text ?? '')
          .join('');
        return ok(text && text.length > 0 ? text : 'No analysis generated.');
      }

      // Anthropic Messages API
      const base = (config.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
      const payload: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      };
      if (system) payload['system'] = system;

      const res = await this.transport.request({
        url: `${base}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': secret ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        timeoutMs: this.timeoutMs,
        ...(signal ? { signal } : {}),
      });
      const bodyText = await res.text();
      if (!res.ok) return this.classifyHttpFailure(res.status, bodyText);
      const json = JSON.parse(bodyText) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const text = json?.content
        ?.filter((c) => c?.type === 'text')
        .map((c) => c?.text ?? '')
        .join('');
      return ok(text && text.length > 0 ? text : 'No analysis generated.');
    } catch (caught) {
      return err({
        code: 'NETWORK_ERROR',
        message: caught instanceof Error ? caught.message : String(caught),
        retryable: true,
      });
    }
  }

  private classifyHttpFailure(status: number, bodyText: string): Result<never, LlmFailure> {
    let message = bodyText.slice(0, 300) || `HTTP ${status}`;
    try {
      const parsed = JSON.parse(bodyText) as { error?: { message?: string } | string };
      if (typeof parsed?.error === 'string') {
        message = parsed.error;
      } else if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      // keep raw snippet
    }

    if (status === 401 || status === 403) {
      return err({ code: 'AUTH_FAILED', message, retryable: false });
    }
    if (status === 429) {
      return err({ code: 'RATE_LIMITED', message, retryable: true });
    }
    if (isRetryableModelFailure(status, bodyText)) {
      return err({ code: 'MODEL_UNAVAILABLE', message, retryable: true });
    }
    return err({ code: 'PROVIDER_ERROR', message, retryable: status >= 500 });
  }
}
