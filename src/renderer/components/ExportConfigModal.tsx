import { useEffect, useState } from 'react';
import { useServicesStore } from '../store/services';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const NAME_MAX = 60;

export function ExportConfigModal({ isOpen, onClose }: Props): JSX.Element | null {
  const services = useServicesStore((s) => s.services);
  const workspaces = useServicesStore((s) => s.workspaces);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setBusy(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NAME_MAX;
  const wsOrdered = [...workspaces].sort((a, b) => a.order - b.order);

  const handleExport = async (): Promise<void> => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.boxb.managed.export({
        name: trimmed,
        services: services.map((s) => {
          const out: Record<string, unknown> = {
            catalogId: s.catalogId,
            name: s.name,
            url: s.url,
            iconUrl: s.iconUrl,
            hibernation: s.hibernation,
            workspaceId: s.workspaceId
          };
          if (s.userAgent) out.userAgent = s.userAgent;
          return out;
        }),
        workspaces: wsOrdered.map((w) => ({
          id: w.id,
          name: w.name,
          icon: w.icon,
          order: w.order
        }))
      });
      if (result.cancelled) {
        // Native dialog dismissal — silent close.
        onClose();
        return;
      }
      if (!result.ok) {
        setError(result.error ?? 'Export failed.');
        setBusy(false);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[480px] mx-4 bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Export Managed Config"
      >
        <h2 className="text-lg font-medium text-fg">Export Managed Config</h2>
        <p className="mt-1 text-[13px] text-muted">
          Save your current setup as a .boxb-config file. Drop the file into a
          team member&apos;s <span className="font-mono text-fg/80">%APPDATA%\\boxb\\configs\\</span>{' '}
          folder, or have them double-click it after installing BoxB.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1" htmlFor="cfg-name">
              Config name
            </label>
            <input
              id="cfg-name"
              autoFocus
              type="text"
              maxLength={NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Support Team v1"
              disabled={busy}
              className={[
                'w-full px-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted',
                'bg-bg border-[0.5px] border-[#1A1A1A]',
                'focus:outline-none focus:ring-2 focus:ring-accent',
                'disabled:opacity-50'
              ].join(' ')}
            />
          </div>

          <div className="rounded-lg bg-bg border-[0.5px] border-[#1A1A1A] p-3 text-[12px] text-muted">
            <div className="text-fg font-medium mb-1">What gets exported</div>
            <div>
              <span className="text-fg">{services.length}</span> service{services.length === 1 ? '' : 's'} across{' '}
              <span className="text-fg">{workspaces.length}</span> workspace
              {workspaces.length === 1 ? '' : 's'}
            </div>
            <div className="mt-1 text-muted/80">
              No login data, session cookies, or personal state are included — each team member
              signs in fresh.
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-[#3A0F0F] border-[0.5px] border-[#5C1818] p-3 text-[12px] text-[#F87171]">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-bg text-fg border-[0.5px] border-[#1A1A1A]',
              'transition-colors duration-150 hover:bg-[#1A1A1A]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'disabled:opacity-50'
            ].join(' ')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleExport();
            }}
            disabled={!valid || busy}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-accent text-bg',
              'transition-opacity duration-150 hover:opacity-90',
              'disabled:opacity-40 disabled:cursor-default disabled:hover:opacity-40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
