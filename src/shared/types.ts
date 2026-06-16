export interface AppDefinition {
  id: string;
  name: string;
  url: string;
  icon: string;
}

export interface Account {
  id: string;
  appId: string;
  label: string;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  order: number;
  createdAt: number;
}

// Per-window terminal tab. Each tab owns one pty in the main process,
// addressed by ptyId. Tabs are NOT persisted across launches — the open/
// closed state of the panel is, but tab content is rebuilt fresh every
// session (PowerShell handles its own command history).
export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  ptyId: string;
  createdAt: number;
}

// Phase 9.5: onboarding tutorial completion state. Stored in its own
// electron-store file (boxb-onboarding.json) so first-launch detection is
// independent of services/managed state. `hasCompletedTutorial` flips true
// when the user finishes OR skips the 4-step tour (both count as "seen" for
// first-launch purposes); `lastCompletedAt` is the epoch ms of that event
// (null until the first completion).
export interface OnboardingState {
  hasCompletedTutorial: boolean;
  lastCompletedAt: number | null;
}

// Phase 9.6: secret scanner. A repository the user has explicitly opted in
// to scanning. `path` is stored POSIX-normalized (forward slashes) so it's
// stable across platforms; `name` is the folder basename for display.
// `lastScanAt` is null until the first manual/hook scan runs.
export interface ProtectedRepo {
  id: string;
  path: string;
  name: string;
  enabledAt: number;
  lastScanAt: number | null;
}

// Severity buckets for detection patterns. High = near-certain credential;
// medium = heuristic (high-entropy strings) prone to false positives.
export type ScanSeverity = 'high' | 'medium' | 'low';

// A single match produced by the scanner engine. `snippet` is ALREADY
// redacted (e.g. "AKIA****MPLE") — the raw secret never leaves the engine,
// so it's safe to render in terminal output or the UI. line/col are 1-based.
export interface ScanResult {
  patternId: string;
  patternName: string;
  severity: ScanSeverity;
  line: number;
  col: number;
  snippet: string;
}

// The result of scanning a whole repository. Only files WITH issues appear
// in `files`; `totalIssues` is the flattened count across them.
export interface ScanReport {
  repo: string;
  timestamp: number;
  files: { path: string; issues: ScanResult[] }[];
  totalIssues: number;
}

// Phase 9.1: managed config bumps this when the schema changes. Files with
// a higher version number are rejected on import with a "needs newer BoxB"
// message. v1 covers: services, workspaces, hard-lock mode.
export const MANAGED_CONFIG_VERSION = 1;

// Service shape inside an exported config. Identity-free: no UUID, no
// partition string, no unreadCount/isMuted/addedAt — those are user state
// that gets regenerated per-install on apply. workspaceId is preserved
// because it's a logical reference to a workspace also in this file.
export interface ManagedConfigService {
  catalogId: string;
  name: string;
  url: string;
  iconUrl: string;
  hibernation: 'light' | 'aggressive';
  workspaceId: string;
  userAgent?: string;
}

// Workspace shape inside a config. Same UUID rule: ids inside the config
// are LOCAL to the file (used to link services to workspaces) and get
// remapped to fresh UUIDs on apply.
export interface ManagedConfigWorkspace {
  id: string;
  name: string;
  icon: string;
  order: number;
}

// The full .boxb-config file format. Plain JSON, version-tagged.
// `lockMode: 'hard'` is the only supported value for v1; soft-lock is
// deferred. `managed: true` is redundant with the file's existence but
// kept as an explicit guard for tooling that might inspect the file.
export interface ManagedConfigFile {
  version: number;
  name: string;
  createdAt: number;
  createdBy: string;
  managed: true;
  lockMode: 'hard';
  services: ManagedConfigService[];
  workspaces: ManagedConfigWorkspace[];
}

// Persisted managed-state for an install. Stored in boxb-managed.json via
// the main process; the renderer mirrors it into a Zustand store on mount.
export interface ManagedState {
  isManaged: boolean;
  configName: string | null;
  importedAt: number | null;
}

// Phase 9.2 / 9.2.1: command bar action vocabulary. The rule parser AND
// the AI fallback both speak this shape so the executor in App.tsx doesn't
// need to know which produced the action.
//
// `target` field semantics by action type:
//   - open-service       → serviceId (executor switches workspace if the
//                          service lives outside the current one)
//   - switch-workspace   → workspaceId
//   - add-catalog-service → catalogId (executor creates a fresh service
//                          in the active workspace using the catalog row)
//   - add-custom-url     → the typed URL string (executor wraps it as a
//                          custom service in the active workspace)
//   - toggle-terminal / quit / hide / add-custom → unused
export type CommandBarActionType =
  | 'open-service'
  | 'switch-workspace'
  | 'toggle-terminal'
  | 'quit'
  | 'hide'
  | 'add-custom'
  | 'add-catalog-service'
  | 'add-custom-url';

export interface CommandBarAction {
  id: string;
  type: CommandBarActionType;
  // User-visible text shown in the result row.
  label: string;
  // Optional secondary text (e.g. category, workspace name) shown muted.
  hint?: string;
  // Visual icon hint. 'service' uses iconUrl, 'workspace' uses single
  // letter, 'system' uses a built-in glyph.
  iconKind: 'service' | 'workspace' | 'system';
  iconUrl?: string;
  iconChar?: string;
  target?: string;
}
