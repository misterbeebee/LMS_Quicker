import type { Result } from '@velm/shared';
import type {
  CookieScope,
  HttpRequest,
  HttpTransport,
  Logger,
  SecretStore,
} from './ports.js';
import { noopLogger } from './ports.js';
import {
  LlmRouter,
  type ChromeBuiltinAdapter,
  type DiscoveredLocalProvider,
  type LlmFailure,
  type LlmFeatureFlags,
  type LlmGenerateRequest,
  type LlmGenerateResponse,
  type LlmProviderConfig,
  type PlatformTarget,
  type ProviderPreset,
} from './llm/index.js';
import {
  SynergyService,
  type Pxp2GradebookRequest,
  type SynergyExportResult,
  type SynergyFailure,
} from './synergy/index.js';

export interface SynergyCredentialsInput {
  readonly accountId?: string;
  readonly username: string;
  readonly password: string;
  readonly districtDomain: string;
  readonly isParent?: boolean;
  readonly reuseExistingSession?: boolean;
}

export interface RawHttpProxyRequest {
  readonly url: string;
  readonly method: HttpRequest['method'];
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly accountId?: string;
  readonly timeoutMs?: number;
}

export interface RawHttpProxyResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly text: string;
}

export interface VelmBackendMeta {
  readonly version: string;
  readonly platform: PlatformTarget;
  readonly multiStudentSupported: boolean;
}

/**
 * Unified typed RPC interface between the Velm React UI and any runtime
 * (Electron main IPC, Chrome MV3 extension, or Express hosted web server).
 */
export interface VelmBackend {
  getMeta(): Promise<VelmBackendMeta>;
  httpRequest(req: RawHttpProxyRequest): Promise<RawHttpProxyResponse>;
  synergy: {
    verify(req: SynergyCredentialsInput): Promise<Result<Record<string, unknown>, SynergyFailure>>;
    getStudentInfo(
      req: SynergyCredentialsInput
    ): Promise<Result<Record<string, unknown>, SynergyFailure>>;
    getGradebook(
      req: SynergyCredentialsInput & Pxp2GradebookRequest
    ): Promise<Result<Record<string, unknown>, SynergyFailure>>;
    exportAll(
      req: SynergyCredentialsInput & { readonly reportPeriod?: number; readonly termIndex?: number }
    ): Promise<Result<SynergyExportResult, SynergyFailure>>;
  };
  llm: {
    listPresets(): Promise<ProviderPreset[]>;
    discoverLocal(): Promise<DiscoveredLocalProvider[]>;
    test(config: LlmProviderConfig): Promise<Result<{ readonly models: string[] }, LlmFailure>>;
    generate(
      config: LlmProviderConfig,
      req: LlmGenerateRequest
    ): Promise<Result<LlmGenerateResponse, LlmFailure>>;
  };
  secrets: {
    set(key: string, value: string): Promise<void>;
    has(key: string): Promise<boolean>;
    del(key: string): Promise<void>;
  };
}

export interface LocalBackendOptions {
  readonly version: string;
  readonly platform: PlatformTarget;
  readonly transport: HttpTransport;
  readonly secretStore: SecretStore;
  readonly cookieScope?: CookieScope;
  readonly llmFeatureFlags?: LlmFeatureFlags;
  readonly chromeBuiltin?: ChromeBuiltinAdapter;
  readonly logger?: Logger;
}

/**
 * Create an in-process VelmBackend wired to @velm/core (used by Electron main process
 * and the MV3 browser extension).
 */
export function createLocalBackend(options: LocalBackendOptions): VelmBackend {
  const logger = options.logger ?? noopLogger;
  const llmRouter = new LlmRouter({
    transport: options.transport,
    secretStore: options.secretStore,
    ...(options.llmFeatureFlags ? { featureFlags: options.llmFeatureFlags } : {}),
    ...(options.chromeBuiltin ? { chromeBuiltin: options.chromeBuiltin } : {}),
  });

  async function withAccountScope<T>(
    accountId: string | undefined,
    fn: (scopeId: import('./ports.js').CookieScopeId | undefined) => Promise<T>
  ): Promise<T> {
    if (!options.cookieScope || !accountId) {
      return fn(undefined);
    }
    const lease = await options.cookieScope.acquire(accountId);
    try {
      return await fn(lease.id);
    } finally {
      await lease.release();
    }
  }

  function makeSynergyService(
    creds: SynergyCredentialsInput,
    scopeId: import('./ports.js').CookieScopeId | undefined
  ): SynergyService {
    return new SynergyService({
      username: creds.username,
      password: creds.password,
      districtDomain: creds.districtDomain,
      ...(creds.isParent !== undefined ? { isParent: creds.isParent } : {}),
      ...(creds.reuseExistingSession !== undefined
        ? { reuseExistingSession: creds.reuseExistingSession }
        : {}),
      transport: options.transport,
      ...(scopeId !== undefined ? { cookieScope: scopeId } : {}),
    });
  }

  return {
    async getMeta() {
      return {
        version: options.version,
        platform: options.platform,
        multiStudentSupported: options.platform !== 'extension',
      };
    },

    async httpRequest(req) {
      return withAccountScope(req.accountId, async (scopeId) => {
        const res = await options.transport.request({
          url: req.url,
          method: req.method,
          ...(req.headers ? { headers: req.headers } : {}),
          ...(req.body !== undefined ? { body: req.body } : {}),
          ...(scopeId !== undefined ? { scope: scopeId } : {}),
          ...(req.timeoutMs !== undefined ? { timeoutMs: req.timeoutMs } : {}),
        });
        const headers: Record<string, string> = {};
        res.headers.forEach?.((val, key) => {
          headers[key.toLowerCase()] = val;
        });
        const link = res.headers.get('link');
        if (link && !headers['link']) headers['link'] = link;
        const contentType = res.headers.get('content-type');
        if (contentType && !headers['content-type']) headers['content-type'] = contentType;
        return {
          status: res.status,
          ok: res.ok,
          url: res.url,
          headers,
          text: await res.text(),
        };
      });
    },

    synergy: {
      verify(req) {
        logger.info(`Synergy verify for ${req.districtDomain}`);
        return withAccountScope(req.accountId, (scopeId) =>
          makeSynergyService(req, scopeId).verifyCredentials()
        );
      },
      getStudentInfo(req) {
        return withAccountScope(req.accountId, (scopeId) =>
          makeSynergyService(req, scopeId).getStudentInfo()
        );
      },
      getGradebook(req) {
        return withAccountScope(req.accountId, (scopeId) =>
          makeSynergyService(req, scopeId).getGradebook({
            ...(req.reportPeriod !== undefined ? { reportPeriod: req.reportPeriod } : {}),
            ...(req.agu !== undefined ? { agu: req.agu } : {}),
            ...(req.permId !== undefined ? { permId: req.permId } : {}),
            ...(req.studentName !== undefined ? { studentName: req.studentName } : {}),
            ...(req.reportPeriodGu !== undefined ? { reportPeriodGu: req.reportPeriodGu } : {}),
          })
        );
      },
      exportAll(req) {
        return withAccountScope(req.accountId, (scopeId) =>
          makeSynergyService(req, scopeId).exportAll({
            ...(req.reportPeriod !== undefined ? { reportPeriod: req.reportPeriod } : {}),
            ...(req.termIndex !== undefined ? { termIndex: req.termIndex } : {}),
          })
        );
      },
    },

    llm: {
      async listPresets() {
        return llmRouter.listPresets(options.platform);
      },
      discoverLocal() {
        if (options.platform !== 'desktop') {
          return Promise.resolve([]);
        }
        return llmRouter.discoverLocal();
      },
      test(config) {
        return llmRouter.test(config);
      },
      generate(config, req) {
        return llmRouter.generate(config, req);
      },
    },

    secrets: {
      set(key, value) {
        return options.secretStore.set(key, value);
      },
      async has(key) {
        const val = await options.secretStore.get(key);
        return Boolean(val && val.length > 0);
      },
      del(key) {
        return options.secretStore.del(key);
      },
    },
  };
}
