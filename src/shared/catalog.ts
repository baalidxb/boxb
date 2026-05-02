export type CatalogCategory =
  | 'messaging'
  | 'email'
  | 'social'
  | 'productivity'
  | 'work'
  | 'developer'
  | 'ai'
  | 'custom';

export type HibernationMode = 'light' | 'aggressive';

export interface CatalogApp {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  category: CatalogCategory;
  // 'light' for messengers — keeps webview mounted and websockets alive,
  // freezes only the rendering pipeline. 'aggressive' for everything else —
  // unmounts the webview entirely, page reloads on next activation.
  hibernation: HibernationMode;
  userAgent?: string;
  description?: string;
  // Template entries (e.g. Jira) require per-user URL customization. The
  // catalog tile click switches AddAppModal into custom URL mode prefilled
  // from this entry instead of adding immediately.
  isTemplate?: boolean;
  // Substring within `url` that must be replaced before the user can save a
  // template entry (e.g. "YOUR-COMPANY" in the Jira template URL). Only
  // meaningful when isTemplate is true.
  templatePlaceholder?: string;
}

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  messaging: 'Messaging',
  email: 'Email',
  social: 'Social',
  productivity: 'Productivity',
  work: 'Work',
  developer: 'Developer',
  ai: 'AI',
  custom: 'Custom'
};

// Order used to render section headers in the catalog modal. 'custom' is
// intentionally excluded — custom services live in the sidebar but aren't a
// browseable catalog section.
export const CATEGORY_ORDER: CatalogCategory[] = [
  'messaging',
  'email',
  'social',
  'productivity',
  'work',
  'developer',
  'ai'
];
