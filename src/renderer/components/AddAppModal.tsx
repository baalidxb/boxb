import { useEffect, useState } from 'react';
import { useServicesStore } from '../store/services';
import { catalog } from '../../catalog/apps';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type CatalogApp,
  type CatalogCategory
} from '@shared/catalog';
import { SearchIcon } from './Icons';

const URL_RE = /^https?:\/\/.+/;

function matches(app: CatalogApp, query: string): boolean {
  const haystack = (app.name + ' ' + app.category).toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function groupByCategory(apps: CatalogApp[]): Map<CatalogCategory, CatalogApp[]> {
  const groups = new Map<CatalogCategory, CatalogApp[]>();
  for (const cat of CATEGORY_ORDER) groups.set(cat, []);
  for (const app of apps) groups.get(app.category)?.push(app);
  return groups;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function faviconUrlFor(url: string): string {
  const host = hostnameOf(url);
  if (!host) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

interface CardProps {
  app: CatalogApp;
  onPick: (app: CatalogApp) => void;
}

function Card({ app, onPick }: CardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onPick(app)}
      className={[
        'flex flex-col items-center justify-center gap-2 p-3 rounded-lg',
        'h-[120px] bg-bg border-[0.5px] border-[#1A1A1A]',
        'transition-colors duration-150 ease-out hover:border-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
      ].join(' ')}
    >
      <img src={app.iconUrl} alt={app.name} className="w-12 h-12 rounded-full" />
      <div className="text-[13px] font-medium text-fg leading-tight line-clamp-2 text-center w-full">
        {app.name}
      </div>
      <div className="text-[11px] text-muted">{CATEGORY_LABELS[app.category]}</div>
    </button>
  );
}

type Mode = 'catalog' | 'custom';

export function AddAppModal(): JSX.Element | null {
  const isOpen = useServicesStore((s) => s.isAddModalOpen);
  const closeAddModal = useServicesStore((s) => s.closeAddModal);
  const addService = useServicesStore((s) => s.addService);
  const setActiveService = useServicesStore((s) => s.setActiveService);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('catalog');
  const [customUrl, setCustomUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [customIcon, setCustomIcon] = useState('');
  const [iconAutoFilled, setIconAutoFilled] = useState(false);

  // Reset internal state when the modal closes.
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setMode('catalog');
      setCustomUrl('');
      setCustomName('');
      setCustomIcon('');
      setIconAutoFilled(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePickCatalog = (app: CatalogApp): void => {
    const id = addService({
      catalogId: app.id,
      name: app.name,
      iconUrl: app.iconUrl,
      url: app.url,
      ...(app.userAgent ? { userAgent: app.userAgent } : {})
    });
    setActiveService(id);
    closeAddModal();
  };

  const handleClose = (): void => {
    closeAddModal();
  };

  const handleUrlBlur = (): void => {
    if (!customUrl) return;
    if (!customIcon || iconAutoFilled) {
      const fav = faviconUrlFor(customUrl);
      if (fav) {
        setCustomIcon(fav);
        setIconAutoFilled(true);
      }
    }
  };

  const customNameTrimmed = customName.trim();
  const isCustomValid =
    URL_RE.test(customUrl.trim()) &&
    customNameTrimmed.length > 0 &&
    customNameTrimmed.length <= 40;

  const handleAddCustom = (): void => {
    if (!isCustomValid) return;
    const url = customUrl.trim();
    const iconUrl = customIcon.trim() || faviconUrlFor(url);
    const id = addService({
      catalogId: 'custom',
      name: customNameTrimmed,
      url,
      iconUrl,
      category: 'custom'
    } as Parameters<typeof addService>[0]);
    setActiveService(id);
    closeAddModal();
  };

  const trimmed = query.trim();
  const filtered = trimmed ? catalog.filter((app) => matches(app, trimmed)) : catalog;
  const grouped = groupByCategory(filtered);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[640px] max-h-[80vh] mx-4 bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl p-5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'catalog' ? 'Add app' : 'Add custom URL'}
      >
        {mode === 'catalog' ? (
          <>
            <div className="relative">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search apps..."
                className={[
                  'w-full pl-9 pr-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted',
                  'bg-surface border-[0.5px] border-[#1A1A1A]',
                  'focus:outline-none focus:ring-2 focus:ring-accent'
                ].join(' ')}
              />
            </div>

            <div className="mt-5 flex-1 min-h-[200px] overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <div className="text-center text-muted text-sm py-12">No apps match.</div>
              ) : trimmed ? (
                <div className="grid grid-cols-4 gap-3">
                  {filtered.map((app) => (
                    <Card key={app.id} app={app} onPick={handlePickCatalog} />
                  ))}
                </div>
              ) : (
                CATEGORY_ORDER.map((cat) => {
                  const apps = grouped.get(cat) ?? [];
                  if (apps.length === 0) return null;
                  return (
                    <section key={cat} className="mb-5 last:mb-0">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">
                        {CATEGORY_LABELS[cat]}
                      </h3>
                      <div className="grid grid-cols-4 gap-3">
                        {apps.map((app) => (
                          <Card key={app.id} app={app} onPick={handlePickCatalog} />
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setMode('custom')}
                className={[
                  'text-xs text-muted rounded',
                  'transition-colors duration-150 ease-out hover:text-fg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                ].join(' ')}
              >
                Add custom URL
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-medium text-fg">Add custom URL</h2>
            <p className="mt-1 text-[13px] text-muted">
              Add any web app by URL. We&apos;ll grab the favicon for the icon.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="custom-url">
                  URL
                </label>
                <input
                  id="custom-url"
                  autoFocus
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onBlur={handleUrlBlur}
                  placeholder="https://example.com"
                  className={[
                    'w-full px-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted',
                    'bg-bg border-[0.5px] border-[#1A1A1A]',
                    'focus:outline-none focus:ring-2 focus:ring-accent'
                  ].join(' ')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="custom-name">
                  Display name
                </label>
                <input
                  id="custom-name"
                  type="text"
                  maxLength={40}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="My App"
                  className={[
                    'w-full px-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted',
                    'bg-bg border-[0.5px] border-[#1A1A1A]',
                    'focus:outline-none focus:ring-2 focus:ring-accent'
                  ].join(' ')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="custom-icon">
                  Icon URL <span className="text-muted/70">(optional)</span>
                </label>
                <input
                  id="custom-icon"
                  type="url"
                  value={customIcon}
                  onChange={(e) => {
                    setCustomIcon(e.target.value);
                    setIconAutoFilled(false);
                  }}
                  placeholder="auto-fetched from URL"
                  className={[
                    'w-full px-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted',
                    'bg-bg border-[0.5px] border-[#1A1A1A]',
                    'focus:outline-none focus:ring-2 focus:ring-accent'
                  ].join(' ')}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode('catalog')}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-medium',
                  'bg-bg text-fg border-[0.5px] border-[#1A1A1A]',
                  'transition-colors duration-150 hover:bg-[#1A1A1A]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                ].join(' ')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!isCustomValid}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-medium',
                  'bg-accent text-bg',
                  'transition-opacity duration-150 hover:opacity-90',
                  'disabled:opacity-40 disabled:cursor-default disabled:hover:opacity-40',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                ].join(' ')}
              >
                Add
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
