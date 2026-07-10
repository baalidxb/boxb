import type { CalendarEvent } from '@shared/types';
import { dlog } from './debug-log';
import { getApiKey } from './ai-config';

// Phase 9.9: AI meeting briefs. Single-shot Haiku call that turns a
// calendar event into a short prep note. Same BYOK key as the command
// bar (boxb-ai.json); no key → callers show event details without AI.

const MODEL = 'claude-haiku-4-5-20251001';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS = 12_000;

function buildPrompt(ev: CalendarEvent): string {
  const when = ev.allDay
    ? new Date(ev.start).toDateString() + ' (all day)'
    : `${new Date(ev.start).toLocaleString()} – ${new Date(ev.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return [
    'You prepare concise meeting briefs for a busy professional.',
    'Meeting details:',
    `Title: ${ev.title}`,
    `When: ${when}`,
    ev.location ? `Location: ${ev.location}` : '',
    ev.attendees.length > 0 ? `Attendees: ${ev.attendees.join(', ')}` : '',
    ev.description ? `Description: ${ev.description.slice(0, 1500)}` : '',
    '',
    'Write a short prep brief with 3-5 bullet points covering: the likely',
    'purpose, anything to prepare or bring, and 1-2 smart questions to ask.',
    'If the details are too thin to infer much, keep it to 2-3 practical',
    'bullets — never invent facts that are not in the details above.',
    'Plain text bullets starting with "- ". No headers, no preamble.'
  ]
    .filter(Boolean)
    .join('\n');
}

export async function generateMeetingBrief(
  ev: CalendarEvent
): Promise<{ ok: boolean; text?: string; error?: string }> {
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
        max_tokens: 400,
        temperature: 0.3,
        messages: [{ role: 'user', content: buildPrompt(ev) }]
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      dlog('BRIEF-AI:http-error', { status: res.status, body: text.slice(0, 200) });
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const block = json.content?.find((b) => b.type === 'text');
    const text = block?.text?.trim();
    if (!text) return { ok: false, error: 'empty response' };
    dlog('BRIEF-AI:ok', { chars: text.length });
    return { ok: true, text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dlog('BRIEF-AI:fetch-err', { error: msg });
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
