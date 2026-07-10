import { BrowserWindow, Menu } from 'electron';
import type { MenuItemConstructorOptions, WebContents } from 'electron';
import { IPC } from '@shared/ipc';
import { dlog } from './debug-log';

// Phase 9.10: selections shorter than this don't get the AI item — a
// double-clicked word is usually a spell-check case, not an AI case.
const MIN_AI_SELECTION_CHARS = 3;
const MAX_AI_SELECTION_CHARS = 8000;

// Spell-check suggestion menu + Context Bridge entry. Electron detects
// misspellings (red underline) but never auto-shows a context menu — apps
// must handle 'context-menu' and build one themselves. Early-return when
// there's neither a misspelling nor a usable selection so pages with
// custom right-click UIs (WhatsApp's formatting toolbar, Slack composer,
// etc.) keep working as before.
export function attachSpellCheckMenu(wc: WebContents): void {
  wc.on('context-menu', (_event, params) => {
    const selection = (params.selectionText ?? '').trim();
    const hasSelection = selection.length >= MIN_AI_SELECTION_CHARS;
    if (!params.misspelledWord && !hasSelection) return;

    const tpl: MenuItemConstructorOptions[] = [];

    if (params.misspelledWord) {
      const suggestions = params.dictionarySuggestions ?? [];
      tpl.push(
        ...suggestions.map((s) => ({
          label: s,
          click: (): void => {
            wc.replaceMisspelling(s);
          }
        })),
        ...(suggestions.length > 0 ? [{ type: 'separator' as const }] : []),
        {
          label: 'Add to dictionary',
          click: (): void => {
            wc.session.addWordToSpellCheckerDictionary(params.misspelledWord);
          }
        }
      );
    }

    if (hasSelection) {
      if (tpl.length > 0) tpl.push({ type: 'separator' as const });
      tpl.push({
        label: 'Ask AI about selection',
        click: (): void => {
          // Webview right-clicks must open the modal in the window that
          // EMBEDS the webview; host-window right-clicks target itself.
          const host = wc.hostWebContents ?? wc;
          host.send(IPC.bridge.open, {
            text: selection.slice(0, MAX_AI_SELECTION_CHARS)
          });
          dlog('BRIDGE:menu-open', { wcId: wc.id, chars: selection.length });
        }
      });
    }

    const menu = Menu.buildFromTemplate(tpl);
    const win = BrowserWindow.fromWebContents(wc);
    if (win) {
      menu.popup({ window: win });
    } else {
      menu.popup();
    }
    dlog('SPELLCHECK:menu-shown', {
      wcId: wc.id,
      misspelled: params.misspelledWord || undefined,
      hasSelection,
      suggestionCount: params.dictionarySuggestions?.length ?? 0
    });
  });
}
