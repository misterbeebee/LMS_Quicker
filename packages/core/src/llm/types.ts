import { z } from 'zod';
import type { CancelSignal } from '../ports.js';

export const ProviderKindSchema = z.enum([
  'openai-compatible',
  'gemini',
  'anthropic',
  'chrome-builtin',
]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const PrivacyTierSchema = z.enum([
  'local',
  'paid-no-training',
  'free-tier-may-train',
  'unknown',
]);
export type PrivacyTier = z.infer<typeof PrivacyTierSchema>;

export const PlatformTargetSchema = z.enum(['desktop', 'extension', 'web']);
export type PlatformTarget = z.infer<typeof PlatformTargetSchema>;

export const LlmProviderAuthSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('apiKey'), secretRef: z.string().min(1) }),
  z.object({ type: z.literal('bearer'), secretRef: z.string().min(1) }),
]);
export type LlmProviderAuth = z.infer<typeof LlmProviderAuthSchema>;

export const LlmProviderConfigSchema = z.object({
  id: z.string().min(1),
  kind: ProviderKindSchema,
  label: z.string().min(1),
  baseUrl: z.string().url().optional(),
  auth: LlmProviderAuthSchema,
  model: z.string().min(1),
  fallbackModels: z.array(z.string().min(1)).optional(),
  privacy: PrivacyTierSchema,
  /**
   * True for keyless / privacy-unfriendly public endpoints (D11).
   * Blocked at runtime unless LlmFeatureFlags.allowPrivacyUnfriendlyEndpoints is true.
   */
  privacyUnfriendly: z.boolean().optional(),
});
export type LlmProviderConfig = z.infer<typeof LlmProviderConfigSchema>;

export interface ProviderPreset {
  readonly id: string;
  readonly group: 'byo-key' | 'free-key-tier' | 'keyless-public' | 'local-server' | 'browser-builtin' | 'custom';
  readonly kind: ProviderKind;
  readonly label: string;
  readonly description: string;
  readonly baseUrl?: string;
  readonly defaultModel: string;
  readonly fallbackModels?: readonly string[];
  readonly authType: 'none' | 'apiKey' | 'bearer';
  readonly privacy: PrivacyTier;
  readonly privacyNotice: string;
  readonly platforms: readonly PlatformTarget[];
  readonly disabledByDefault?: boolean;
  readonly privacyUnfriendly?: boolean;
  readonly localProbeUrl?: string;
}

export interface DiscoveredLocalProvider {
  readonly presetId: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly models: readonly string[];
}

export interface LlmFeatureFlags {
  /**
   * D11: Keyless / privacy-unfriendly public endpoints are disabled by default,
   * with support left in place for possible future enablement.
   */
  readonly allowPrivacyUnfriendlyEndpoints?: boolean;
}

export interface ChromeBuiltinAdapter {
  isAvailable(): Promise<boolean>;
  generate(prompt: string, system?: string): Promise<string>;
}

export interface LlmGenerateRequest {
  readonly prompt: string;
  readonly system?: string;
  readonly modelOverride?: string;
  readonly minimizeStudentData?: boolean;
  readonly studentIdentifiersToRedact?: readonly string[];
  readonly signal?: CancelSignal;
}

export interface LlmGenerateResponse {
  readonly text: string;
  readonly modelUsed: string;
  readonly providerId: string;
  readonly privacy: PrivacyTier;
  readonly redactedCount: number;
}

export type LlmErrorCode =
  | 'PROVIDER_DISABLED'
  | 'MISSING_CREDENTIALS'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'UNSUPPORTED_PLATFORM'
  | 'INVALID_CONFIG'
  | 'PROVIDER_ERROR';

export interface LlmFailure {
  readonly code: LlmErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}
