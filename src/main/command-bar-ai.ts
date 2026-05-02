import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { CommandBarAction, CommandBarActionType } from '@shared/types';
import { dlog } from './debug-log';
import { getApiKey, setApiKey, clearApiKey, hasApiKey } from './ai-config';

// Phase 9.2: AI fallback for the command bar. Called from the renderer
// only when the rule parser couldn't match a query AND the user has set
// an API key. Single-shot Claude Haiku call, parsed to a CommandBarAction.

// Model + endpoint constants. Haiku 4.5 is the latest, fastest Claude
// at the time of writing — appropriate for low-latency command parsing.
const MODEL = 'claude-haiku-4-5-20251001';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS = 5000;

interface ServiceMeta {
  id: string;
  name: string;
  catalogId: string;
  workspaceId: string;
}

interface WorkspaceMeta {
  id: string;
  name: string;
}

interface ParseRequest {
  query: string;
  services: ServiceMeta[];
  workspaces: WorkspaceMeta[];
  // True when the install is in managed mode — caller filters out actions
  // the user can't execute (e.g. add-custom). We pass the flag through
  // to the prompt so the model doesn't suggest disabled actions either.
  isManaged: boolean;
}

const VALID_ACTION_TYPES: ReadonlySet<CommandBarActionType> = new Set<CommandBarActionType>([
  'open-service',
  'switch-workspace',
  'toggle-terminal',
  'quit',
  'hide',
  'add-custom'
]);

function buildPrompt(req: ParseRequest): string {
  const services = req.services
    .map((s) => `- id=${s.id} name="${s.name}"`)
    .join('\n');
  const workspaces = req.workspaces
    .map((w) => `- id=${w.id} name="${w.name}"`)
    .join('\n');
  const actions = req.isManaged
    ? 'open-service, switch-workspace, toggle-terminal, quit, hide'
    : 'open-service, switch-workspace, toggle-terminal, quit, hide, add-custom';

  return [
    'You are a navigation assistant for BoxB, a multi-messenger desktop app.',
    `The user said: "${req.query}"`,
    '',
    'Available services:',
    services || '(none)',
    '',
    'Available workspaces:',
    workspaces || '(none)',
    '',
    `Available actions: ${actions}`,
    '',
    'Return ONLY valid JSON. Format:',
    '  {"action": "open-service", "target": "<service-id>"}',
    '  {"action": "switch-workspace", "target": "<workspace-id>"}',
    '  {"action": "toggle-terminal"}',
    '  {"action": "quit"}',
    '  {"action": "hide"}',
    req.isManaged ? '' : '  {"action": "add-custom"}',
    '  {"action": "none"}    -- if the request is unclear or unsupported',
    '',
    'No prose, no code fences, just the JSON object.'
  ]
    .filter(Boolean)
    .join('\n');
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponseBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicResponseBlock[];
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = {
      model: MODEL,
      max_tokens: 100,
      temperature: 0,
      messages: [{ role: 'user', content: prompt } satisfies AnthropicMessage]
    };
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      dlog('AI:http-error', { status: res.status, body: text.slice(0, 200) });
      return null;
    }
    const json = (await res.json()) as AnthropicResponse;
    const block = json.content?.find((b) => b.type === 'text');
    return block?.text ?? null;
  } catch (err) {
    dlog('AI:fetch-err', {
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Tolerate Haiku occasionally wrapping JSON in code fences despite the
// instruction. Strips ```...``` and grabs the first {...} object.
function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fenced ? fenced[1] : trimmed;
  const objMatch = body!.match(/\{[\s\S]*\}/);
  return objMatch ? objMatch[0] : null;
}

interface ModelResponse {
  action?: unknown;
  target?: unknown;
}

function buildAction(
  parsed: ModelResponse,
  req: ParseRequest
): CommandBarAction | null {
  if (typeof parsed.action !== 'string') return null;
  const action = parsed.action as CommandBarActionType;
  if (!VALID_ACTION_TYPES.has(action)) return null;

  if (action === 'open-service') {
    if (typeof parsed.target !== 'string') return null;
    const svc = req.services.find((s) => s.id === parsed.target);
    if (!svc) return null;
    return {
      id: `ai:${svc.id}`,
      type: 'open-service',
      label: svc.name,
      iconKind: 'service',
      target: svc.id
    };
  }
  if (action === 'switch-workspace') {
    if (typeof parsed.target !== 'string') return null;
    const ws = req.workspaces.find((w) => w.id === parsed.target);
    if (!ws) return null;
    return {
      id: `ai:ws:${ws.id}`,
      type: 'switch-workspace',
      label: `Switch to ${ws.name}`,
      iconKind: 'workspace',
      iconChar: ws.name.charAt(0).toUpperCase(),
      target: ws.id
    };
  }
  if (action === 'toggle-terminal') {
    return {
      id: 'ai:terminal',
      type: 'toggle-terminal',
      label: 'Toggle terminal',
      iconKind: 'system'
    };
  }
  if (action === 'quit') {
    return {
      id: 'ai:quit',
      type: 'quit',
      label: 'Quit BoxB',
      iconKind: 'system'
    };
  }
  if (action === 'hide') {
    return {
      id: 'ai:hide',
      type: 'hide',
      label: 'Hide BoxB',
      iconKind: 'system'
    };
  }
  if (action === 'add-custom') {
    if (req.isManaged) return null;
    return {
      id: 'ai:add-custom',
      type: 'add-custom',
      label: 'Add custom URL',
      iconKind: 'system'
    };
  }
  return null;
}

export async function parseIntent(req: ParseRequest): Promise<CommandBarAction | null> {
  const key = getApiKey();
  if (!key) return null;
  const raw = await callAnthropic(buildPrompt(req), key);
  if (!raw) return null;
  const jsonText = extractJson(raw);
  if (!jsonText) {
    dlog('AI:parse-no-json', { raw: raw.slice(0, 200) });
    return null;
  }
  let parsed: ModelResponse;
  try {
    parsed = JSON.parse(jsonText) as ModelResponse;
  } catch (err) {
    dlog('AI:parse-err', {
      error: err instanceof Error ? err.message : String(err),
      raw: jsonText.slice(0, 200)
    });
    return null;
  }
  return buildAction(parsed, req);
}

export function registerAiIpc(): void {
  ipcMain.handle(IPC.ai.setApiKey, (_event, key: unknown): boolean => {
    if (typeof key !== 'string') return false;
    setApiKey(key);
    return true;
  });

  ipcMain.handle(IPC.ai.clearApiKey, (): void => {
    clearApiKey();
  });

  ipcMain.handle(IPC.ai.hasApiKey, (): boolean => hasApiKey());

  ipcMain.handle(
    IPC.ai.parseIntent,
    async (_event, req: ParseRequest): Promise<CommandBarAction | null> => {
      if (!req || typeof req.query !== 'string' || req.query.trim().length === 0) {
        return null;
      }
      const sanitized: ParseRequest = {
        query: req.query.trim().slice(0, 200),
        services: Array.isArray(req.services) ? req.services.slice(0, 50) : [],
        workspaces: Array.isArray(req.workspaces) ? req.workspaces.slice(0, 20) : [],
        isManaged: Boolean(req.isManaged)
      };
      return parseIntent(sanitized);
    }
  );
}
