import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';
import { getApiKey } from './ai-config';

// Phase 9.10: Context Bridge. Selected text from any service → one AI
// action → result the user can carry anywhere. Single-shot Haiku calls,
// BYOK key from boxb-ai.json.

const MODEL = 'claude-haiku-4-5-20251001';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS = 20_000;
const MAX_TEXT_CHARS = 8000;
const MAX_QUESTION_CHARS = 500;

export type BridgeAction = 'summarize' | 'translate' | 'reply' | 'explain' | 'custom';

const ACTIONS: ReadonlySet<BridgeAction> = new Set<BridgeAction>([
  'summarize',
  'translate',
  'reply',
  'explain',
  'custom'
]);

function buildPrompt(action: BridgeAction, text: string, question: string): string {
  const base = `Text taken from a message or page:\n"""\n${text}\n"""\n\n`;
  switch (action) {
    case 'summarize':
      return (
        base +
        'Summarize this text in 2-5 short bullet points. Keep names, numbers and dates exact. Plain text bullets starting with "- ". No preamble.'
      );
    case 'translate':
      return (
        base +
        'Translate this text to English. If it is already fully in English, reply exactly: "Already in English." Output only the translation, no notes.'
      );
    case 'reply':
      return (
        base +
        'Draft a reply to this message. Match the language and tone of the original (professional if formal, warm if casual). Be concise — a few sentences unless the message clearly needs more. Output only the reply text, ready to paste.'
      );
    case 'explain':
      return (
        base +
        'Explain what this text means in simple, plain language. If it contains jargon, technical terms or legal wording, decode them. Short paragraphs, no preamble.'
      );
    case 'custom':
      return base + `Answer this question about the text above: ${question}\nBe direct and concise.`;
  }
}

export function registerBridgeIpc(): void {
  ipcMain.handle(
    IPC.bridge.run,
    async (
      _event,
      payload: { action?: unknown; text?: unknown; question?: unknown }
    ): Promise<{ ok: boolean; text?: string; error?: string }> => {
      const action = payload?.action as BridgeAction;
      if (typeof action !== 'string' || !ACTIONS.has(action)) {
        return { ok: false, error: 'invalid action' };
      }
      const text =
        typeof payload?.text === 'string' ? payload.text.trim().slice(0, MAX_TEXT_CHARS) : '';
      if (!text) return { ok: false, error: 'empty text' };
      const question =
        typeof payload?.question === 'string'
          ? payload.question.trim().slice(0, MAX_QUESTION_CHARS)
          : '';
      if (action === 'custom' && !question) {
        return { ok: false, error: 'empty question' };
      }
      const key = getApiKey();
      if (!key) return { ok: false, error: 'no-key' };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': ANTHROPIC_VERSION
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1000,
            temperature: 0.3,
            messages: [{ role: 'user', content: buildPrompt(action, text, question) }]
          }),
          signal: controller.signal
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          dlog('BRIDGE-AI:http-error', { status: res.status, body: body.slice(0, 200) });
          return { ok: false, error: `HTTP ${res.status}` };
        }
        const json = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };
        const block = json.content?.find((b) => b.type === 'text');
        const out = block?.text?.trim();
        if (!out) return { ok: false, error: 'empty response' };
        dlog('BRIDGE-AI:ok', { action, inChars: text.length, outChars: out.length });
        return { ok: true, text: out };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dlog('BRIDGE-AI:fetch-err', { error: msg });
        return { ok: false, error: msg };
      } finally {
        clearTimeout(timer);
      }
    }
  );
}
