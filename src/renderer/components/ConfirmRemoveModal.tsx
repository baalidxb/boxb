import { useEffect, useRef } from 'react';
import { useServicesStore } from '../store/services';

export function ConfirmRemoveModal(): JSX.Element | null {
  const id = useServicesStore((s) => s.confirmRemoveFor);
  const services = useServicesStore((s) => s.services);
  const cancelRemove = useServicesStore((s) => s.cancelRemove);
  const confirmRemove = useServicesStore((s) => s.confirmRemove);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (id) cancelRef.current?.focus();
  }, [id]);

  if (!id) return null;
  const service = services.find((s) => s.id === id);
  if (!service) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={cancelRemove}
      role="presentation"
    >
      <div
        className="w-full max-w-[420px] mx-4 bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-remove-title"
      >
        <h2 id="confirm-remove-title" className="text-lg font-medium text-fg">
          Remove {service.name}?
        </h2>
        <p className="mt-2 text-sm text-muted">
          This will delete the tile and sign you out of this session. This action can&apos;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={cancelRemove}
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
            onClick={() => {
              void confirmRemove();
            }}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-[#EF4444] text-white',
              'transition-colors duration-150 hover:bg-[#DC2626]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]'
            ].join(' ')}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
