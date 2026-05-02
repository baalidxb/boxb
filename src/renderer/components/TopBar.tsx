import { useServicesStore } from '../store/services';
import { useManagedStore } from '../store/managed';
import { reloadActiveWebview } from '../lib/webview-controller';
import { GearIcon, RefreshIcon } from './Icons';

export function TopBar(): JSX.Element {
  const activeServiceId = useServicesStore((s) => s.activeServiceId);
  const services = useServicesStore((s) => s.services);
  const workspaces = useServicesStore((s) => s.workspaces);
  const lockedWorkspaceId = useServicesStore((s) => s.lockedWorkspaceId);
  const isManaged = useManagedStore((s) => s.isManaged);
  const managedConfigName = useManagedStore((s) => s.configName);
  const managedHydrated = useManagedStore((s) => s.hydrated);
  const active = services.find((s) => s.id === activeServiceId);
  const lockedWs = lockedWorkspaceId
    ? workspaces.find((w) => w.id === lockedWorkspaceId) ?? null
    : null;
  const showManagedPill = managedHydrated && isManaged;

  const buttonClass = [
    'flex items-center justify-center text-muted rounded',
    'transition-colors duration-150 ease-out hover:text-fg',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    'disabled:opacity-40 disabled:cursor-default disabled:hover:text-muted'
  ].join(' ');

  const wordmark = (
    <>
      <span className="text-fg">Box</span>
      <span className="text-accent font-bold">B</span>
    </>
  );

  const separator = <span className="text-muted mx-2">·</span>;

  let title: JSX.Element;
  if (lockedWs) {
    title = active ? (
      <>
        <span className="text-fg">{lockedWs.name}</span>
        {separator}
        <span className="text-fg">{active.name}</span>
      </>
    ) : (
      <>
        {wordmark}
        {separator}
        <span className="text-fg">{lockedWs.name}</span>
      </>
    );
  } else {
    title = active ? <span className="text-fg">{active.name}</span> : wordmark;
  }

  return (
    <header className="h-11 w-full shrink-0 bg-surface border-b-[0.5px] border-b-[#1A1A1A] flex items-center justify-between pl-4 pr-4">
      <div className="text-sm font-medium truncate">{title}</div>
      <div className="flex items-center gap-3">
        {showManagedPill && (
          <div
            // Subtle gold pill with leading dot. Communicates "this BoxB
            // is admin-managed" without screaming. Hover shows config name.
            title={managedConfigName ? `Managed: ${managedConfigName}` : 'Managed install'}
            className={[
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full',
              'text-[10px] font-semibold tracking-wider uppercase',
              'text-accent/80 bg-accent/10 border-[0.5px] border-accent/30'
            ].join(' ')}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>Managed</span>
          </div>
        )}
        <button
          type="button"
          aria-label="Refresh"
          className={buttonClass}
          disabled={!active}
          onClick={() => reloadActiveWebview()}
        >
          <RefreshIcon size={18} />
        </button>
        <button
          type="button"
          aria-label="Service settings"
          className={buttonClass}
          disabled={!active}
        >
          <GearIcon size={18} />
        </button>
      </div>
    </header>
  );
}
