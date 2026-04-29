import { useEffect, useRef } from 'react';
import { useServicesStore } from '../store/services';

export function ConfirmDeleteWorkspaceModal(): JSX.Element | null {
  const id = useServicesStore((s) => s.confirmDeleteWorkspaceFor);
  const workspaces = useServicesStore((s) => s.workspaces);
  const services = useServicesStore((s) => s.services);
  const cancelDelete = useServicesStore((s) => s.cancelDeleteWorkspace);
  const confirmDelete = useServicesStore((s) => s.confirmDeleteWorkspace);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (id) cancelRef.current?.focus();
  }, [id]);

  if (!id) return null;
  const target = workspaces.find((w) => w.id === id);
  if (!target) return null;

  const remaining = workspaces.filter((w) => w.id !== id);
  const isLast = remaining.length === 0;
  const sortedRemaining = [...remaining].sort((a, b) => a.order - b.order);
  const migrationTarget = sortedRemaining[0];
  const movingCount = services.filter((s) => s.workspaceId === id).length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={cancelDelete}
      role="presentation"
    >
      <div
        className="w-full max-w-[420px] mx-4 bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-workspace-title"
      >
        <h2
          id="confirm-delete-workspace-title"
          className="text-lg font-medium text-fg"
        >
          Delete workspace &lsquo;{target.name}&rsquo;?
        </h2>
        <p className="mt-2 text-sm text-muted">
          {isLast ? (
            <>This is the last remaining workspace and can&apos;t be deleted.</>
          ) : movingCount === 0 ? (
            <>This workspace has no services. The workspace will be removed.</>
          ) : (
            <>
              Its {movingCount} service{movingCount === 1 ? '' : 's'} will move to{' '}
              &lsquo;{migrationTarget?.name}&rsquo;.
            </>
          )}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={cancelDelete}
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
            onClick={confirmDelete}
            disabled={isLast}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-[#EF4444] text-white',
              'transition-colors duration-150 hover:bg-[#DC2626]',
              'disabled:opacity-40 disabled:cursor-default disabled:hover:bg-[#EF4444]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]'
            ].join(' ')}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
