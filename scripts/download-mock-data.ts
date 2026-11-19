#!/usr/bin/env node
/**
 * One-time Account Data Downloader CLI for Velm.
 *
 * Fetches every Canvas LMS and StudentVUE/ParentVUE endpoint supported by Velm,
 * sanitizes PII by default, and writes a single offline mock datastore file
 * (`velm-mock-store.v1.json`, gitignored).
 *
 * All inputs are accepted via CLI flags, environment variables, or interactive prompts
 * (with masked input for tokens/passwords) — no manual file editing required.
 *
 * Usage:
 *   pnpm run mock:download
 *   pnpm run mock:download -- --canvas-domain school.instructure.com --out my-mock.json
 *
 * CLI flags (all optional; omitted values are prompted interactively):
 *   --canvas-domain <host>
 *   --canvas-token <token>
 *   --synergy-domain <host>
 *   --synergy-user <username>
 *   --synergy-pass <password>
 *   --parent                Treat Synergy login as ParentVUE
 *   --out <path>            Output JSON path (default: ./velm-mock-store.v1.json)
 *   --raw                   Skip PII sanitization (NOT recommended if sharing)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { downloadAccountDatastore } from '../packages/core/src/mock/downloader.js';

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length && !args[idx + 1]?.startsWith('--')) {
    return args[idx + 1];
  }
  return undefined;
}

/**
 * Prompt for a secret with masked output (`*`) when running in an interactive TTY.
 */
async function promptSecret(promptText: string): Promise<string> {
  if (!input.isTTY) {
    const rl = readline.createInterface({ input, output });
    try {
      return (await rl.question(promptText)).trim();
    } finally {
      rl.close();
    }
  }

  return new Promise<string>((resolve) => {
    output.write(promptText);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    let value = '';
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          output.write('\n');
          input.setRawMode(Boolean(wasRaw));
          input.pause();
          input.off('data', onData);
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          // Ctrl+C
          output.write('\n');
          input.setRawMode(Boolean(wasRaw));
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write('\b \b');
          }
        } else {
          value += ch;
          output.write('*');
        }
      }
    };
    input.on('data', onData);
  });
}

function createNodeFetchTransport() {
  return {
    async request(req: {
      url: string;
      method: string;
      headers?: Readonly<Record<string, string>>;
      body?: string | Uint8Array;
      timeoutMs?: number;
    }) {
      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
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
        let cachedText: string | null = null;
        return {
          status: res.status,
          ok: res.ok,
          url: res.url || req.url,
          headers: {
            get: (name: string) => res.headers.get(name),
            forEach: (cb: (v: string, k: string) => void) => res.headers.forEach((v, k) => cb(v, k)),
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

async function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const rawMode = args.includes('--raw');
  const outFile = getFlagValue(args, '--out') || 'velm-mock-store.v1.json';

  const canvasDomain =
    getFlagValue(args, '--canvas-domain') ||
    process.env.CANVAS_DOMAIN ||
    (await promptText('Canvas domain (e.g. mcpsmd.instructure.com, blank to skip): '));

  const canvasToken = canvasDomain
    ? getFlagValue(args, '--canvas-token') ||
      process.env.CANVAS_TOKEN ||
      (await promptSecret('Canvas Personal Access Token (input hidden): ')).trim()
    : '';

  const synergyDomain =
    getFlagValue(args, '--synergy-domain') ||
    process.env.SYNERGY_DOMAIN ||
    (await promptText('StudentVUE/ParentVUE domain (e.g. md-mcps-psv.edupoint.com, blank to skip): '));

  const synergyUsername = synergyDomain
    ? getFlagValue(args, '--synergy-user') ||
      process.env.SYNERGY_USERNAME ||
      (await promptText('StudentVUE/ParentVUE Username: '))
    : '';

  const synergyPassword = synergyDomain
    ? getFlagValue(args, '--synergy-pass') ||
      process.env.SYNERGY_PASSWORD ||
      (await promptSecret('StudentVUE/ParentVUE Password (input hidden): '))
    : '';

  const synergyIsParent =
    args.includes('--parent') ||
    process.env.SYNERGY_IS_PARENT === 'true' ||
    (synergyDomain
      ? (await promptText('Is this a ParentVUE account? (y/N): ')).toLowerCase() === 'y'
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
  console.log(
    '\nNote: velm-mock-store*.json is gitignored. Download it from Codespaces and upload it to Antigravity to load into the offline mock backend.'
  );
}

main().catch((err) => {
  console.error('Download failed:', err);
  process.exit(1);
});
