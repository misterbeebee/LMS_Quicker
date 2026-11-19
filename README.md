# Velm — Local-First Canvas LMS & StudentVUE Dashboard

Velm is a privacy-first academic dashboard that unifies **Canvas LMS** assignments/schedules, **Edupoint Synergy (StudentVUE / ParentVUE)** official gradebooks, and an optional **routable AI Academic Advisor** — running **100% locally** on your device with zero Velm cloud servers.

## Distribution Targets

| Target | Package | Description |
| --- | --- | --- |
| **Desktop App (Primary)** | `apps/desktop` (`@velm/desktop`) | Electron app for macOS (arm64/x64), Windows (x64), and Linux (AppImage/deb) with OS keychain storage and multi-student isolated cookie partitions. |
| **Chrome / Chromebook Extension** | `apps/extension` (`@velm/extension`) | Manifest V3 extension (`apps/extension/dist`) with WebCrypto AES-GCM secret storage and open-tab SSO reuse. |
| **Firefox Extension** | `apps/extension` (`@velm/extension`) | Manifest V3 extension (`apps/extension/dist-firefox`) for Firefox 121+. |
| **Web Dev / Demo** | `apps/web` (`@velm/web`) | React 19 + Vite 6 + Tailwind v4 UI (also serves as the renderer bundle for Desktop and Extensions). |

## Documentation

- **User Guide (Installation, Unsigned Build Warnings, First-Run Setup):** [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md)
- **Design & Architecture (Monorepo, `VelmBackend` RPC, Synergy, LLM Router, Security):** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Developer Guide (Local Setup, Testing, Codespaces Phone Testing, Mock Datastore):** [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

## Quick Start (Developers)

```bash
# Requires Node 22+ and pnpm 12+
pnpm install

# Verify typecheck, unit tests, and all builds
pnpm run lint
pnpm run test:unit
pnpm run build

# Run web dev server
pnpm run dev

# Launch Electron desktop app
pnpm run start:desktop

# Interactive launcher (great for GitHub Codespaces / noVNC)
pnpm run remote:menu
```
