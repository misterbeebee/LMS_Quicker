import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..');
const webDist = path.resolve(extRoot, '..', 'web', 'dist');
const outDir = path.join(extRoot, 'dist');

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.name !== 'server.cjs' && entry.name !== 'server.cjs.map') {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  // Ensure apps/web/dist exists
  try {
    await fs.access(path.join(webDist, 'index.html'));
  } catch {
    throw new Error(
      `Missing ${path.join(webDist, 'index.html')}. Run "pnpm --filter @velm/web build" first.`
    );
  }

  await fs.rm(outDir, { recursive: true, force: true });
  await copyDir(webDist, outDir);

  // Bundle MV3 service worker + extension bootstrap script
  await Promise.all([
    esbuild.build({
      entryPoints: [path.join(extRoot, 'src', 'sw.ts')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'chrome120',
      sourcemap: true,
      outfile: path.join(outDir, 'sw.js'),
    }),
    esbuild.build({
      entryPoints: [path.join(extRoot, 'src', 'bootstrap.ts')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'chrome120',
      sourcemap: true,
      outfile: path.join(outDir, 'bootstrap.js'),
    }),
  ]);

  // Inject <script type="module" src="./bootstrap.js"></script> before the React app script (CSP-clean)
  const indexHtmlPath = path.join(outDir, 'index.html');
  const html = await fs.readFile(indexHtmlPath, 'utf-8');
  const injected = html.replace(
    /<script\s+type="module"/,
    '<script type="module" src="./bootstrap.js"></script>\n  <script type="module"'
  );
  if (injected === html) {
    throw new Error('Could not find <script type="module"> in apps/web/dist/index.html');
  }
  await fs.writeFile(indexHtmlPath, injected, 'utf-8');

  // Copy manifest.json and GETTING_STARTED.md
  await fs.copyFile(path.join(extRoot, 'manifest.json'), path.join(outDir, 'manifest.json'));
  const guidePath = path.resolve(extRoot, '..', '..', 'docs', 'GETTING_STARTED.md');
  try {
    await fs.copyFile(guidePath, path.join(outDir, 'GETTING_STARTED.md'));
  } catch {
    // optional
  }

  console.log(`Built unpacked Chrome MV3 extension at ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
