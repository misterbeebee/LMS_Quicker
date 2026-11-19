import { z } from 'zod';
import {
  LlmProviderConfigSchema,
  type LlmGenerateRequest,
  type LlmProviderConfig,
  type RawHttpProxyRequest,
  type SynergyCredentialsInput,
  type VelmBackend,
} from '@velm/core';

import { VELM_IPC_CHANNELS } from './channels.js';
export { VELM_IPC_CHANNELS };

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

function isDisallowedProxyHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1'
  ) {
    return true;
  }
  if (host.startsWith('127.') || host.startsWith('169.254.')) {
    return true;
  }
  return false;
}

const HttpUrlSchema = z.string().url().refine(
  (value) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:') {
        return false;
      }
      return !isDisallowedProxyHost(parsed.hostname);
    } catch {
      return false;
    }
  },
  {
    message:
      'Only remote https:// URLs are permitted via httpRequest (loopback and link-local hosts are blocked).',
  }
);

const RawHttpProxyRequestSchema = z.object({
  url: HttpUrlSchema,
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

const SynergyCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
  districtDomain: z.string().min(1),
  isParent: z.boolean().optional(),
  accountId: z.string().optional(),
  reuseExistingSession: z.boolean().optional(),
});

const SynergyGradebookInputSchema = SynergyCredentialsSchema.extend({
  reportPeriod: z.number().int().optional(),
  reportPeriodGu: z.string().optional(),
  agu: z.string().optional(),
  permId: z.string().optional(),
  studentName: z.string().optional(),
});

const SynergyScheduleInputSchema = SynergyCredentialsSchema.extend({
  termIndex: z.number().int().optional(),
});

const SynergyExportAllInputSchema = SynergyCredentialsSchema.extend({
  reportPeriod: z.number().int().optional(),
  termIndex: z.number().int().optional(),
});

const LlmGenerateRequestSchema = z.object({
  prompt: z.string().min(1),
  system: z.string().optional(),
  modelOverride: z.string().optional(),
  minimizeStudentData: z.boolean().optional(),
  studentIdentifiersToRedact: z.array(z.string()).optional(),
});

const SecretKeySchema = z.string().min(1).max(128);
const SecretSetSchema = z.object({
  key: SecretKeySchema,
  value: z.string().max(16_384),
});

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Register all Zod-validated IPC handlers connecting the sandboxed renderer
 * to the main-process @velm/core VelmBackend.
 */
export function registerVelmIpcHandlers(ipcMain: IpcMainLike, backend: VelmBackend): void {
  ipcMain.handle(VELM_IPC_CHANNELS.getMeta, async () => {
    return backend.getMeta();
  });

  ipcMain.handle(VELM_IPC_CHANNELS.httpRequest, async (_event, rawReq) => {
    const parsed = RawHttpProxyRequestSchema.parse(rawReq);
    return backend.httpRequest(stripUndefined(parsed) as RawHttpProxyRequest);
  });

  ipcMain.handle(VELM_IPC_CHANNELS.synergyVerify, async (_event, rawInput) => {
    const parsed = SynergyCredentialsSchema.parse(rawInput);
    return backend.synergy.verify(stripUndefined(parsed) as SynergyCredentialsInput);
  });

  ipcMain.handle(VELM_IPC_CHANNELS.synergyStudentInfo, async (_event, rawInput) => {
    const parsed = SynergyCredentialsSchema.parse(rawInput);
    return backend.synergy.getStudentInfo(stripUndefined(parsed) as SynergyCredentialsInput);
  });

  ipcMain.handle(VELM_IPC_CHANNELS.synergyGradebook, async (_event, rawInput) => {
    const parsed = SynergyGradebookInputSchema.parse(rawInput);
    return backend.synergy.getGradebook(
      stripUndefined(parsed) as SynergyCredentialsInput & {
        reportPeriod?: number;
        reportPeriodGu?: string;
        agu?: string;
        permId?: string;
        studentName?: string;
      }
    );
  });

  ipcMain.handle(VELM_IPC_CHANNELS.synergyExportAll, async (_event, rawInput) => {
    const parsed = SynergyExportAllInputSchema.parse(rawInput);
    return backend.synergy.exportAll(
      stripUndefined(parsed) as SynergyCredentialsInput & {
        reportPeriod?: number;
        termIndex?: number;
      }
    );
  });

  ipcMain.handle(VELM_IPC_CHANNELS.llmListPresets, async () => {
    return backend.llm.listPresets();
  });

  ipcMain.handle(VELM_IPC_CHANNELS.llmDiscoverLocal, async () => {
    return backend.llm.discoverLocal();
  });

  ipcMain.handle(VELM_IPC_CHANNELS.llmTest, async (_event, rawConfig) => {
    const config = stripUndefined(LlmProviderConfigSchema.parse(rawConfig)) as LlmProviderConfig;
    return backend.llm.test(config);
  });

  ipcMain.handle(VELM_IPC_CHANNELS.llmGenerate, async (_event, rawConfig, rawReq) => {
    const config = stripUndefined(LlmProviderConfigSchema.parse(rawConfig)) as LlmProviderConfig;
    const req = stripUndefined(LlmGenerateRequestSchema.parse(rawReq)) as LlmGenerateRequest;
    return backend.llm.generate(config, req);
  });

  ipcMain.handle(VELM_IPC_CHANNELS.secretsSet, async (_event, rawPayload) => {
    const parsed = SecretSetSchema.parse(rawPayload);
    await backend.secrets.set(parsed.key, parsed.value);
  });

  ipcMain.handle(VELM_IPC_CHANNELS.secretsHas, async (_event, rawKey) => {
    const key = SecretKeySchema.parse(rawKey);
    return backend.secrets.has(key);
  });

  ipcMain.handle(VELM_IPC_CHANNELS.secretsDel, async (_event, rawKey) => {
    const key = SecretKeySchema.parse(rawKey);
    await backend.secrets.del(key);
  });
}
