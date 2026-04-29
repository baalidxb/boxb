export type CatalogCategory =
  | 'messaging'
  | 'email'
  | 'productivity'
  | 'work'
  | 'ai'
  | 'custom';

export interface CatalogApp {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  category: CatalogCategory;
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
