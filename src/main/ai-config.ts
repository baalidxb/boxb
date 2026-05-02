import Store from 'electron-store';

// Phase 9.2: Anthropic API key storage for the AI command-bar fallback.
//
// SECURITY NOTE: the key is stored as plain text in boxb-ai.json under the
// userData dir. This is intentional for v1:
//   - electron-store's encryptionKey option uses a static AES key shipped
//     in the binary, which is obfuscation not security — anyone reading
//     the source can decrypt the file. False sense of security is worse
//     than honest plain-text.
//   - True at-rest protection requires OS keychain integration
//     (DPAPI on Windows, Keychain on macOS, libsecret on Linux). Out of
//     scope for v1 — flagged as a future hardening.
//   - The key is never transmitted anywhere except api.anthropic.com over
//     TLS in command-bar-ai.ts.

interface StoreSchema {
  apiKey?: string;
}

const store = new Store<StoreSchema>({ name: 'boxb-ai' });

export function getApiKey(): string | null {
  const v = store.get('apiKey');
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function setApiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    store.delete('apiKey');
    return;
  }
  store.set('apiKey', trimmed);
}

export function clearApiKey(): void {
  store.delete('apiKey');
}

export function hasApiKey(): boolean {
  return getApiKey() !== null;
}
