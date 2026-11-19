# Velm Developer Guide

This guide covers local development, workspace scripts, testing, remote testing from a phone via GitHub Codespaces, offline mock fixtures, and the CI/Release pipelines.

---

## 1. Prerequisites

- **Node.js**: `22.x` or newer (LTS)
- **Package Manager**: `pnpm@12.21.0` (managed via `packageManager` in root `package.json`; enable with `corepack enable`)

```bash
pnpm install
```

> **Headless CI / VM Tip:** Set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` during `pnpm install` if you only need to run typechecks, unit tests, or web/extension builds without downloading the Electron binary.

---

## 2. Workspace Structure & Scripts

| Command | Description |
| --- | --- |
| `pnpm run lint` | Run `tsc --noEmit` across all 5 workspaces (`@velm/shared`, `@velm/core`, `@velm/web`, `@velm/desktop`, `@velm/extension`). |
| `pnpm run test:unit` | Run Vitest unit tests across all workspaces (127+ tests). |
| `pnpm run build` | Ordered full build: `shared → core → web → desktop → extension`. |
| `pnpm run dev` | Start the `@velm/web` Vite dev server (`http://localhost:3000`). |
| `pnpm run build:desktop` | Build `@velm/web` renderer + `@velm/desktop` main/preload bundles. |
| `pnpm run start:desktop` | Build and launch the Electron desktop app locally. |
| `pnpm run build:extension` | Build unpacked Chrome MV3 extension at `apps/extension/dist`. |
| `pnpm run build:extension:firefox` | Build unpacked Firefox MV3 extension at `apps/extension/dist-firefox`. |
| `pnpm run mock:download` | Run the interactive Account Data Downloader CLI to create a local `velm-mock-store.v1.json`. |
| `pnpm run remote:menu` | Launch the interactive Codespaces / noVNC testing menu (`scripts/codespaces-launch.sh`). |

### TypeScript Strictness Note
- `packages/shared`, `packages/core`, `apps/desktop`, and `apps/extension` all use strict TypeScript (`tsconfig.base.json`).
- `apps/web/tsconfig.json` currently keeps `strictNullChecks: false` for legacy component compatibility. When narrowing `Result<T, E>` from `@velm/core` inside `apps/web`, always use the `isOk(res)` / `isErr(res)` type guards instead of `if (!res.ok)`.

---

## 3. One-Time Account Data Downloader & Offline Mock Testing

To iterate on real-shaped Canvas + StudentVUE data without hitting live school servers (and without committing student data to GitHub):

```bash
pnpm run mock:download
```

- All credentials (Canvas domain/token, Synergy domain/username/password) are accepted via **interactive prompts (with masked `*` input for secrets)** or CLI flags / environment variables — never edit credentials into source files.
- By default, `--sanitize` is enabled to deterministically pseudonymize names, emails, student IDs, and domains.
- Output defaults to `velm-mock-store.v1.json` (or pass `--out /path/to/file.json`). All `velm-mock-store*.json` files are `.gitignore`d and must **never** be committed to GitHub.
- To load the fixture in the app: open Velm's Login screen, click **Mock JSON**, and select your JSON file.

---

## 4. Remote Testing from a Phone (GitHub Codespaces + noVNC)

This repo includes [`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json) configured with `desktop-lite` (Fluxbox + noVNC on port `6080`), Node 22, `pnpm@12.21.0`, Electron GUI libraries, and Chromium.

1. Open a Codespace on your branch (e.g. `port/monorepo`) from your phone or desktop browser.
2. Open the **Ports** tab and click the forwarded URL for port **6080** (`Desktop (noVNC)` — default password `vscode`).
3. In the Codespaces terminal, run:
   ```bash
   pnpm run remote:menu
   ```
4. Choose from the interactive menu:
   - **1) Download / refresh offline mock datastore** (`pnpm run mock:download`)
   - **2) Launch Electron Desktop App** (automatically passes `--no-sandbox` for Docker/Codespaces)
   - **3) Launch Chromium with unpacked Chrome MV3 extension** (`apps/extension/dist`)
   - **4) Start Web Dev Server** (port `3000`, reachable directly via Codespaces port forwarding without noVNC)

---

## 5. CI & Unsigned Release Workflows

- **CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml))**: Runs on every push to `main` / `port/**` and PRs into `main`. Verifies `pnpm run lint`, `pnpm run test:unit`, and `pnpm run build`.
- **Unsigned Releases ([`.github/workflows/release.yml`](../.github/workflows/release.yml))**: Runs on `v*` git tags or manual `workflow_dispatch`:
  - Packages unsigned Electron installers for macOS (`.dmg` arm64 & x64), Windows (`.exe` x64), and Linux (`.AppImage` & `.deb` x64) using `apps/desktop/electron-builder.yml`.
  - Packages `velm-extension-chrome-<ver>.zip` and `velm-extension-firefox-<ver>.zip`.
  - Generates `SHA256SUMS.txt` across all artifacts, attaches `docs/GETTING_STARTED.md`, and publishes a **draft** GitHub Release.

---

## 6. Commit & PR Guidelines

- Keep commits small, focused, and logical (one cohesive feature or fix per commit).
- Never commit `.env`, `velm-mock-store*.json`, or real student credentials/fixtures.
- Always run `pnpm run lint && pnpm run test:unit && pnpm run build` before pushing.
