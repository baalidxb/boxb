export type CatalogCategory =
  | 'messaging'
  | 'email'
  | 'productivity'
  | 'work'
  | 'ai';

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
  ai: 'AI'
};

export const CATEGORY_ORDER: CatalogCategory[] = [
  'messaging',
  'email',
  'productivity',
  'work',
  'ai'
];
