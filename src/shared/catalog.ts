export type CatalogCategory =
  | 'messaging'
  | 'email'
  | 'productivity'
  | 'work'
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
}

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  messaging: 'Messaging',
  email: 'Email',
  productivity: 'Productivity',
  work: 'Work',
  ai: 'AI',
  custom: 'Custom'
};

// Order used to render section headers in the catalog modal. 'custom' is
// intentionally excluded — custom services live in the sidebar but aren't a
// browseable catalog section.
export const CATEGORY_ORDER: CatalogCategory[] = [
  'messaging',
  'email',
  'productivity',
  'work',
  'ai'
];
