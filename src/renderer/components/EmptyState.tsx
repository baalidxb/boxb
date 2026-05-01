import { useEffect, useState } from 'react';
import { useServicesStore } from '../store/services';
import { Logo } from './Logo';

export function EmptyState(): JSX.Element {
  const openAddModal = useServicesStore((s) => s.openAddModal);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.boxb.app
      .version()
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        // Version display is decorative — silently skip on failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-bg">
      <Logo size={96} />
      <div className="mt-[20px] text-[22px] font-medium text-fg">One hive for everything</div>
      <div className="mt-[8px] text-[13px] text-muted">Press + to add your first app</div>
      <button
        type="button"
        onClick={openAddModal}
        className={[
          'mt-[28px] px-7 py-3 rounded-lg text-base font-medium text-accent',
          'border border-accent',
          'transition-colors duration-150 ease-out hover:bg-accent hover:text-bg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        ].join(' ')}
      >
        Add an app
      </button>
      {version && (
        <div className="mt-[20px] text-[11px] text-muted font-mono">v{version}</div>
      )}
    </div>
  );
}
