#!/usr/bin/env node
/**
 * One-time Account Data Downloader CLI for Velm.
 *
 * Fetches every Canvas LMS and StudentVUE/ParentVUE endpoint supported by Velm,
 * sanitizes PII by default, and writes a single offline mock datastore file
 * (`velm-mock-store.v1.json`, gitignored) that can be uploaded to Antigravity
 * and replayed with `createMockDatastoreBackend`.
 *
 * Usage (env vars or interactive prompts):
 *   CANVAS_DOMAIN=school.instructure.com CANVAS_TOKEN=... \
 *   SYNERGY_DOMAIN=sis.edupoint.com SYNERGY_USERNAME=... SYNERGY_PASSWORD=... \
 *   pnpm run mock:download
 *
 * Optional flags:
 *   --out <path>    Output file path (default: ./velm-mock-store.v1.json)
 *   --raw           Skip PII sanitization (NOT recommended if sharing)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { downloadAccountDatastore } from '../packages/core/src/mock/downloader.js';

function createNodeFetchTransport() {
  return {
    async request(req) {
      const controller = new AbortController();
      let timeoutHandle;
      if (req.timeoutMs && req.timeoutMs > 0) {
        timeoutHandle = setTimeout(() => controller.abort(), req.timeoutMs);
      }
      try {
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers ? { ...req.headers } : undefined,
          body: req.body !== undefined ? req.body : undefined,
          signal: controller.signal,
          redirect: 'follow',
        });
        const buf = new Uint8Array(await res.arrayBuffer());
        let cachedText = null;
        return {
          status: res.status,
          ok: res.ok,
          url: res.url || req.url,
          headers: {
            get: (name) => res.headers.get(name),
            forEach: (cb) => res.headers.forEach((v, k) => cb(v, k)),
          },
          text: async () => {
            if (cachedText === null) cachedText = new TextDecoder('utf-8').decode(buf);
            return cachedText;
          },
          bytes: async () => buf,
        };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const rawMode = args.includes('--raw');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : 'velm-mock-store.v1.json';

  const rl = readline.createInterface({ input, output });
  try {
    const canvasDomain =
      process.env.CANVAS_DOMAIN ||
      (await rl.question('Canvas domain (e.g. mcpsmd.instructure.com, blank to skip): ')).trim();
    const canvasToken = canvasDomain
      ? process.env.CANVAS_TOKEN || (await rl.question('Canvas Personal Access Token: ')).trim()
      : '';

    const synergyDomain =
      process.env.SYNERGY_DOMAIN ||
      (await rl.question('StudentVUE/ParentVUE domain (e.g. md-mcps-psv.edupoint.com, blank to skip): ')).trim();
    const synergyUsername = synergyDomain
      ? process.env.SYNERGY_USERNAME || (await rl.question('StudentVUE/ParentVUE Username: ')).trim()
      : '';
    const synergyPassword = synergyDomain
      ? process.env.SYNERGY_PASSWORD || (await rl.question('StudentVUE/ParentVUE Password: '))
      : '';
    const synergyIsParent =
      process.env.SYNERGY_IS_PARENT === 'true' ||
      (synergyDomain
        ? (await rl.question('Is this a ParentVUE account? (y/N): ')).trim().toLowerCase() === 'y'
        : false);

    if (!canvasDomain && !synergyDomain) {
      console.error('Nothing to download — provide at least a Canvas or Synergy domain.');
      process.exit(1);
    }

    console.log('\nDownloading account snapshot...');
    const store = await downloadAccountDatastore({
      transport: createNodeFetchTransport(),
      ...(canvasDomain && canvasToken ? { canvas: { domain: canvasDomain, token: canvasToken } } : {}),
      ...(synergyDomain && synergyUsername
        ? {
            synergy: {
              domain: synergyDomain,
              username: synergyUsername,
              password: synergyPassword,
              isParent: synergyIsParent,
            },
          }
        : {}),
      sanitize: !rawMode,
      logger: {
        debug: () => {},
        info: (msg) => console.log(msg),
        warn: (msg) => console.warn(msg),
        error: (msg) => console.error(msg),
      },
    });

    const resolvedOut = path.resolve(process.cwd(), outFile);
    await fs.writeFile(resolvedOut, JSON.stringify(store, null, 2), { mode: 0o600 });

    const courseCount = store.canvas?.courses.length ?? 0;
    const synergyKeys = Object.keys(store.synergy?.data ?? {});
    const errCount = Object.keys(store.scrapeErrors ?? {}).length;

    console.log(`\nSaved ${store.sanitized ? 'SANITIZED' : 'RAW'} mock datastore to: ${resolvedOut}`);
    console.log(`  Canvas courses: ${courseCount}`);
    console.log(`  Synergy datasets: ${synergyKeys.length > 0 ? synergyKeys.join(', ') : 'none'}`);
    if (errCount > 0) {
      console.log(`  Non-fatal endpoint warnings (${errCount}):`, store.scrapeErrors);
    }
    console.log('\nNote: velm-mock-store*.json is gitignored. Upload this file to Antigravity to load it into the offline mock backend.');
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('Download failed:', err);
  process.exit(1);
});
