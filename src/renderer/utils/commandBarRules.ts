import type { CommandBarAction } from '@shared/types';
import type { Service } from '../store/services';
import type { Workspace } from '@shared/types';
import type { CatalogApp } from '@shared/catalog';

// Phase 9.2 / 9.2.1: pure rule-based parser. Runs on every keystroke
// (cheap), returns ranked CommandBarAction[]. The AI fallback only fires
// if this returns an empty list AND the user presses Enter AND a key is
// set — see CommandBar.tsx.
//
// Phonebook = all services across all workspaces + the full catalog (minus
// dedup-by-catalogId) + workspaces + system actions + a paste-URL detector.
// Locked windows hide cross-workspace and workspace-switch results;
// managed installs hide catalog-add and custom-URL.

export interface RuleContext {
  // ALL services in the install — NOT filtered by active workspace.
  services: Service[];
  workspaces: Workspace[];
  // Full catalog. Templates (isTemplate=true) are silently skipped from
  // catalog-add results because they require URL customization that the
  // command bar can't gather in one keypress.
  catalog: CatalogApp[];
  isManaged: boolean;
  // Locked-workspace windows (Phase 5b.5) suppress cross-workspace
  // navigation + workspace-switch results because the window is sealed.
  isLocked: boolean;
  activeWorkspaceId: string;
}

interface ScoredAction {
  action: CommandBarAction;
  score: number;
}

const MAX_RESULTS = 8;
// URL detection — matches "https://..." or anything with a dot that
// could plausibly be a hostname (e.g. "example.com", "app.notion.so").
// The dot-form check is deliberately permissive; the worst case is a
// false positive that the user dismisses.
const URL_RE = /^https?:\/\/\S+$/i;
const HOSTLIKE_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i;

// Higher = better. We rank exact > prefix > word-boundary > substring.
function scoreMatch(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  // word-boundary substring (e.g. "WhatsApp Web" matches "web")
  if (new RegExp(`\\b${escapeRegex(n)}`).test(h)) return 60;
  if (h.includes(n)) return 40;
  return 0;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Service action with workspace-aware secondary text. Cross-workspace
// hits show the workspace name so the user knows Enter will switch
// workspace before activating.
function serviceAction(
  svc: Service,
  workspace: Workspace | undefined,
  isCurrentWorkspace: boolean
): CommandBarAction {
  const wsName = workspace?.name ?? '';
  const hint = isCurrentWorkspace
    ? 'Service'
    : wsName
      ? `Service · ${wsName}`
      : 'Service';
  return {
    id: `svc:${svc.id}`,
    type: 'open-service',
    label: svc.name,
    hint,
    iconKind: 'service',
    iconUrl: svc.iconUrl,
    target: svc.id
  };
}

function workspaceAction(ws: Workspace): CommandBarAction {
  return {
    id: `ws:${ws.id}`,
    type: 'switch-workspace',
    label: `Switch to ${ws.name}`,
    hint: 'Workspace',
    iconKind: 'workspace',
    iconChar: ws.icon || ws.name.charAt(0).toUpperCase(),
    target: ws.id
  };
}

function catalogAction(entry: CatalogApp): CommandBarAction {
  return {
    id: `cat:${entry.id}`,
    type: 'add-catalog-service',
    label: `Add ${entry.name} to BoxB`,
    hint: 'Adds to current workspace',
    iconKind: 'service',
    iconUrl: entry.iconUrl,
    target: entry.id
  };
}

function customUrlAction(url: string): CommandBarAction {
  return {
    id: `url:${url}`,
    type: 'add-custom-url',
    label: `Add custom URL: ${url}`,
    hint: 'Adds to current workspace',
    iconKind: 'system',
    target: url
  };
}

function systemActions(ctx: RuleContext): CommandBarAction[] {
  const out: CommandBarAction[] = [
    {
      id: 'sys:terminal',
      type: 'toggle-terminal',
      label: 'Toggle terminal',
      hint: 'Ctrl+J',
      iconKind: 'system'
    },
    {
      id: 'sys:hide',
      type: 'hide',
      label: 'Hide BoxB',
      hint: 'Minimize to tray',
      iconKind: 'system'
    },
    {
      id: 'sys:quit',
      type: 'quit',
      label: 'Quit BoxB',
      iconKind: 'system'
    }
  ];
  // The bare "Add custom URL" action opens AddAppModal in custom mode.
  // Hidden in managed mode (admin-locked). The URL-paste detector below
  // is a separate one-shot action that adds + activates in one step.
  if (!ctx.isManaged) {
    out.push({
      id: 'sys:add-custom',
      type: 'add-custom',
      label: 'Add custom URL',
      hint: 'Open the add-app modal',
      iconKind: 'system'
    });
  }
  return out;
}

// Default suggestions when input is empty. Prefer current-workspace
// services because those are what the user will hit Enter on without
// typing. Spec calls this "command examples" — concrete is more useful
// than generic prose.
export function defaultSuggestions(ctx: RuleContext): CommandBarAction[] {
  const suggestions: CommandBarAction[] = [];
  const wsById = new Map(ctx.workspaces.map((w) => [w.id, w]));
  // Current-workspace services first; if the workspace is empty, fall
  // back to a sample of services from other workspaces so the bar isn't
  // useless on an empty workspace.
  const inCurrent = ctx.services.filter(
    (s) => s.workspaceId === ctx.activeWorkspaceId
  );
  const seed = inCurrent.length > 0 ? inCurrent : ctx.services;
  for (const svc of seed.slice(0, 4)) {
    const ws = wsById.get(svc.workspaceId);
    suggestions.push(serviceAction(svc, ws, svc.workspaceId === ctx.activeWorkspaceId));
  }
  // One workspace switch hint if there are 2+ workspaces (and not locked).
  if (!ctx.isLocked && ctx.workspaces.length > 1) {
    const otherWs = ctx.workspaces.find((w) => w.id !== ctx.activeWorkspaceId);
    if (otherWs) suggestions.push(workspaceAction(otherWs));
  }
  // Always suggest terminal toggle — the most common system action.
  suggestions.push({
    id: 'sys:terminal',
    type: 'toggle-terminal',
    label: 'Toggle terminal',
    hint: 'Ctrl+J',
    iconKind: 'system'
  });
  return suggestions.slice(0, MAX_RESULTS);
}

// Strip leading verbs ("open ", "go to ", etc.) from the query so the
// remainder can be matched against names. "open whatsapp" → "whatsapp".
function stripActionVerb(q: string): { stripped: string; verb: 'open' | 'switch' | null } {
  const m = q.match(/^(open|go\s*to|switch\s*to|launch|find)\s+(.+)$/i);
  if (m) {
    const verb = /switch/i.test(m[1]!) ? 'switch' : 'open';
    return { stripped: m[2]!, verb };
  }
  return { stripped: q, verb: null };
}

// System-action quick-match patterns. Returns one or none.
function matchSystemPhrase(q: string, ctx: RuleContext): CommandBarAction | null {
  const trimmed = q.trim().toLowerCase();
  if (/^(open|toggle|show|hide|close)\s+terminal$/.test(trimmed) || trimmed === 'terminal') {
    return {
      id: 'sys:terminal',
      type: 'toggle-terminal',
      label: 'Toggle terminal',
      hint: 'Ctrl+J',
      iconKind: 'system'
    };
  }
  if (/^(quit|exit)(\s+boxb)?$/.test(trimmed)) {
    return {
      id: 'sys:quit',
      type: 'quit',
      label: 'Quit BoxB',
      iconKind: 'system'
    };
  }
  if (/^(hide|close)\s+(boxb|app)$/.test(trimmed) || trimmed === 'hide') {
    return {
      id: 'sys:hide',
      type: 'hide',
      label: 'Hide BoxB',
      hint: 'Minimize to tray',
      iconKind: 'system'
    };
  }
  if (!ctx.isManaged && /^(add|new)\s+(app|url|custom)/.test(trimmed)) {
    return {
      id: 'sys:add-custom',
      type: 'add-custom',
      label: 'Add custom URL',
      iconKind: 'system'
    };
  }
  return null;
}

// Heuristic URL detection. Returns the URL (with protocol) if the query
// looks like one, else null. Permissive — false positives just become
// dismissable suggestions, false negatives let the user try anyway via
// the bare "Add custom URL" action.
function detectUrl(q: string, isManaged: boolean): string | null {
  if (isManaged) return null;
  const t = q.trim();
  if (URL_RE.test(t)) return t;
  if (HOSTLIKE_RE.test(t)) return `https://${t}`;
  return null;
}

export function parseQuery(rawQuery: string, ctx: RuleContext): CommandBarAction[] {
  const q = rawQuery.trim();
  if (!q) return defaultSuggestions(ctx);

  // URL-paste detector wins over everything else — no point matching
  // "https://example.com" against service names.
  const url = detectUrl(q, ctx.isManaged);
  if (url) return [customUrlAction(url)];

  const sysMatch = matchSystemPhrase(q, ctx);
  if (sysMatch) return [sysMatch];

  const { stripped, verb } = stripActionVerb(q);
  const needle = stripped.toLowerCase();

  const scored: ScoredAction[] = [];
  const wsById = new Map(ctx.workspaces.map((w) => [w.id, w]));

  // Services: match across ALL workspaces. Same-workspace hits get a
  // small boost so the user's "fastest path" lands at the top. Locked
  // windows skip out-of-workspace services entirely.
  if (verb !== 'switch') {
    for (const svc of ctx.services) {
      if (ctx.isLocked && svc.workspaceId !== ctx.activeWorkspaceId) continue;
      const s1 = scoreMatch(svc.name, needle);
      const s2 = scoreMatch(svc.defaultName, needle);
      const base = Math.max(s1, s2);
      if (base > 0) {
        const isCurrent = svc.workspaceId === ctx.activeWorkspaceId;
        // Same-workspace boost = +5; defeats ties without dominating
        // higher-quality cross-workspace matches.
        const score = isCurrent ? base + 5 : base;
        scored.push({
          action: serviceAction(svc, wsById.get(svc.workspaceId), isCurrent),
          score
        });
      }
    }
  }

  // Catalog-add suggestions for entries the user HASN'T installed yet.
  // Skip: managed installs (can't add), template entries (need URL
  // customization in modal flow), and any catalog row whose catalogId
  // already matches an existing service (dedup — user clearly knows
  // about it). Catalog-add ranks below existing-service hits so users
  // never see "Add WhatsApp" above their actual WhatsApp tile.
  if (!ctx.isManaged && verb !== 'switch') {
    const installedCatalogIds = new Set(ctx.services.map((s) => s.catalogId));
    for (const entry of ctx.catalog) {
      if (entry.isTemplate) continue;
      if (installedCatalogIds.has(entry.id)) continue;
      const score = scoreMatch(entry.name, needle);
      if (score > 0) {
        // Catalog rows lose 25 points vs an installed-service hit of the
        // same quality. Same-workspace hits already have +5, so a perfect
        // catalog match (100) ranks just below a perfect substring match
        // on an installed service (40+5=45)? No — wait, perfect catalog
        // match is 100-25=75, beats substring on installed (40+5=45).
        // We want catalog ABOVE substring on installed only when catalog
        // matches stronger. -25 gives the right ordering: catalog exact
        // (75) > installed prefix (80? actually 80+5=85... hmm). Let me
        // think — actually keep it simple: catalog -25 means catalog
        // exact (75) ranks below installed prefix (85), which feels right.
        scored.push({ action: catalogAction(entry), score: score - 25 });
      }
    }
  }

  // Workspaces: switch verb prefers workspaces, else they still appear
  // but ranked lower than service hits. Locked windows hide them entirely.
  if (!ctx.isLocked) {
    for (const ws of ctx.workspaces) {
      const score = scoreMatch(ws.name, needle);
      if (score > 0) {
        const final = verb === 'switch' ? score + 20 : score - 5;
        scored.push({ action: workspaceAction(ws), score: final });
      }
    }
  }

  // System actions also match by label substring — "ter" finds terminal.
  // Lower base weight so they don't drown out service matches.
  for (const sys of systemActions(ctx)) {
    const score = scoreMatch(sys.label, needle);
    if (score > 0) {
      scored.push({ action: sys, score: score - 10 });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map((s) => s.action);
}
