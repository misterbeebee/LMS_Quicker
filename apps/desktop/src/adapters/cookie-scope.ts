import { asCookieScopeId, type CookieScope, type CookieScopeLease } from '@velm/core';

/**
 * Sanitize an account identifier into a safe Electron session partition name.
 * Using `persist:svue-<id>` gives each student account a completely isolated
 * Chromium cookie jar on disk without leaking cookies across siblings.
 */
export function accountIdToPartition(accountId: string): string {
  const cleaned = accountId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return `persist:svue-${cleaned || 'default'}`;
}

export function createElectronCookieScope(): CookieScope {
  return {
    async acquire(accountId: string): Promise<CookieScopeLease> {
      const partition = accountIdToPartition(accountId);
      return {
        id: asCookieScopeId(partition),
        async release(): Promise<void> {
          // Persistent Electron partitions stay managed by Chromium; nothing to tear down.
        },
      };
    },
  };
}
