# BoxB — Project Context

> Loaded into Claude's context for every prompt in this project. Keep concise and current.

## What BoxB is
- Multi-messenger desktop app (similar to Rambox) — runs many web apps (WhatsApp, Telegram, Gmail, Slack, ChatGPT, etc.) as tabs in one Electron window.
- Multi-account support, unified notifications, modern UI, lighter footprint than Rambox.
- Domain: boxb.app · Tagline: "One hive for everything"

## Stack
- **Electron 33+** with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The preload exposes a typed `window.boxb` API via `contextBridge`.
- **React 18 + Vite** for the renderer; **TypeScript strict mode** everywhere.
- **Tailwind CSS v3** (dark-only in v0.1).
- **Zustand** for renderer state.
- **electron-store v10** (ESM) wrapped behind a `StorageAdapter` interface in `src/shared/storage.ts`.
- **electron-vite** for per-process bundling (main / preload / renderer in one config).
- **electron-builder** for packaging (Win .exe via NSIS, macOS .dmg, Linux .AppImage + .deb).
- Main process is ESM (`out/main/index.js`); preload is CJS (`out/preload/index.cjs`) because Electron sandboxed preload requires CJS.

## Design tokens (Tailwind theme)
| Token   | Value     | Use                       |
|---------|-----------|---------------------------|
| bg      | `#000000` | App background            |
| fg      | `#FFFFFF` | Primary text/foreground   |
| accent  | `#D4AF37` | Brand gold, CTAs, focus   |
| muted   | `#6B6B6B` | Secondary text            |
| surface | `#0F0F0F` | Cards, inputs, panels     |
| border  | `#1A1A1A` | Hairlines, dividers       |

Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif`. No web font loaded yet — Inter will be self-hosted later.

## Folder rules
- `src/main/` — Electron main process. Window, lifecycle, tray, IPC handlers, storage backend.
- `src/preload/` — Preload scripts. The ONLY bridge between main and renderer; output is `.cjs`.
- `src/renderer/` — React app. No Node imports. No direct IPC — go through `window.boxb`.
- `src/shared/` — Types, IPC channel constants, the `StorageAdapter` interface. Imported by all three processes via the `@shared/*` alias.
- `src/catalog/` — `apps.json` catalog of supported web services (URLs, icons). Populated in a later phase.
- `resources/` — Icons and brand assets used by electron-builder.
- `build/` — `electron-builder.yml` lives here.
- `out/` — electron-vite build output (gitignored).
- `release/` — electron-builder artifacts (gitignored).

## IPC conventions
- All channel names are constants in `src/shared/ipc.ts`. Never hard-code channel strings elsewhere.
- Renderer calls main via `window.boxb.<area>.<method>(...)`. Preload wires each method to `ipcRenderer.invoke(IPC.<area>.<method>, ...)`.
- Main handlers go in `src/main/ipc/`. Register via `registerIpcHandlers()` in `app.whenReady`.

## Storage
- All persistence flows through `StorageAdapter` (`src/shared/storage.ts`).
- Phase 1 implementation: `ElectronStoreAdapter` (`src/main/storage/electron-store-adapter.ts`).
- Future cloud sync will be a second adapter implementing the same interface — selected at runtime from settings. Don't bypass the adapter.

## Scripts
- `npm run dev` — Vite + Electron with HMR (renderer) and main/preload auto-restart.
- `npm run build` — Compiles main + preload + renderer to `out/`.
- `npm run typecheck` — Runs the three target tsconfigs in sequence.
- `npm run lint` — ESLint v9 flat config, TS + React rules.
- `npm run package[:win|:mac|:linux]` — Build + electron-builder.

(`pnpm` preferred when available; fell back to `npm` because pnpm wasn't installed at scaffold time.)

## Phase 1 scope (current)
- Scaffold project structure and tooling.
- Boot an empty Electron window rendering a React placeholder.
- Wire `StorageAdapter` interface and `ElectronStoreAdapter` (no UI yet).
- Define IPC channel constants in `shared/ipc.ts` (only `app:version` for now).

## Out of scope for Phase 1
- App catalog content (`src/catalog/apps.json` stays `[]`).
- Sidebar, tabs, webview/BrowserView container, app switcher UI.
- Multi-account management UI.
- Notifications (system tray, badge counts, unread counts).
- Settings UI, theming switcher, light mode.
- Cloud sync / `CloudStorageAdapter` (interface stub only).
- Auto-updater, code signing, telemetry.
- Inter font self-hosting.
- Strict CSP in `index.html` (revisit when UI lands).
- Tests (Vitest/Playwright come once UI exists).
- Real icon assets in `resources/` (placeholders only — packaging will warn).

## Working agreements
- TypeScript strict mode is non-negotiable. No `any` unless a TODO with reason.
- All renderer-to-main communication goes through `window.boxb` — never `ipcRenderer` direct.
- `BrowserWindow` defaults stay locked: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- New persisted state goes through the `StorageAdapter`, not raw `electron-store`.
- New IPC channels: add to `src/shared/ipc.ts`, register a handler in `src/main/ipc/`, expose via preload. Never skip a step.
- Don't install dependencies without flagging — keep the footprint lean.
