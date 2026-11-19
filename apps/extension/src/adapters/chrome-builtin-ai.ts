import type { ChromeBuiltinAdapter } from '@velm/core';

interface ChromeLanguageModelSession {
  prompt(input: string): Promise<string>;
  destroy?(): void;
}

interface ChromeLanguageModelApi {
  availability(): Promise<string>;
  create(options?: { systemPrompt?: string }): Promise<ChromeLanguageModelSession>;
}

/**
 * Feature-detected adapter for Chrome Built-in AI (Gemini Nano Prompt API).
 * Gracefully reports unavailable on Chromebooks or devices without Gemini Nano.
 */
export function createChromeBuiltinAdapter(
  root: Record<string, unknown> = globalThis as unknown as Record<string, unknown>
): ChromeBuiltinAdapter {
  function getApi(): ChromeLanguageModelApi | null {
    const candidate = root['LanguageModel'] as Partial<ChromeLanguageModelApi> | undefined;
    if (candidate && typeof candidate.availability === 'function' && typeof candidate.create === 'function') {
      return candidate as ChromeLanguageModelApi;
    }
    return null;
  }

  return {
    async isAvailable(): Promise<boolean> {
      const api = getApi();
      if (!api) return false;
      try {
        const status = await api.availability();
        return status === 'available' || status === 'readily';
      } catch {
        return false;
      }
    },

    async generate(prompt: string, system?: string): Promise<string> {
      const api = getApi();
      if (!api) {
        throw new Error('Chrome Built-in AI (LanguageModel) is not available on this device.');
      }
      const session = await api.create(system ? { systemPrompt: system } : undefined);
      try {
        return await session.prompt(prompt);
      } finally {
        session.destroy?.();
      }
    },
  };
}
