import { BrowserWindow, Menu } from 'electron';
import type { MenuItemConstructorOptions, WebContents } from 'electron';
import { dlog } from './debug-log';

// Spell-check suggestion menu. Electron detects misspellings (red underline)
// but never auto-shows a context menu — apps must handle 'context-menu' and
// build one themselves. Early-return when there's no misspelling so pages
// with custom right-click UIs (WhatsApp's formatting toolbar, Slack composer,
// etc.) keep working as before.
export function attachSpellCheckMenu(wc: WebContents): void {
  wc.on('context-menu', (_event, params) => {
    if (!params.misspelledWord) return;

    const suggestions = params.dictionarySuggestions ?? [];
    const tpl: MenuItemConstructorOptions[] = [
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
    ];

    const menu = Menu.buildFromTemplate(tpl);
    const win = BrowserWindow.fromWebContents(wc);
    if (win) {
      menu.popup({ window: win });
    } else {
      menu.popup();
    }
    dlog('SPELLCHECK:menu-shown', {
      wcId: wc.id,
      misspelled: params.misspelledWord,
      suggestionCount: suggestions.length
    });
  });
}
