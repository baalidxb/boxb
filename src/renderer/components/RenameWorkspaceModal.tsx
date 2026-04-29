import { useEffect, useState } from 'react';
import {
  isValidWorkspaceIcon,
  isValidWorkspaceName,
  useServicesStore
} from '../store/services';

export function RenameWorkspaceModal(): JSX.Element | null {
  const id = useServicesStore((s) => s.renameWorkspaceFor);
  const workspaces = useServicesStore((s) => s.workspaces);
  const closeModal = useServicesStore((s) => s.closeRenameWorkspace);
  const renameWorkspace = useServicesStore((s) => s.renameWorkspace);
  const target = workspaces.find((w) => w.id === id);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  useEffect(() => {
    if (target) {
      setName(target.name);
      setIcon(target.icon);
    } else {
      setName('');
      setIcon('');
    }
  }, [target]);

  if (!id || !target) return null;

  const nameValid = isValidWorkspaceName(name);
  const iconValid = isValidWorkspaceIcon(icon);
  const canSave = nameValid && iconValid;

  const handleSave = (): void => {
    if (!canSave) return;
    try {
      renameWorkspace(id, name, icon || undefined);
      closeModal();
    } catch {
      // validation already prevents
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={closeModal}
      role="presentation"
    >
      <div
        className="w-full max-w-[420px] mx-4 bg-surface border-[0.5px] border-[#1A1A1A] rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-workspace-title"
      >
        <h2 id="rename-workspace-title" className="text-lg font-medium text-fg">
          Rename workspace
        </h2>

        <div className="mt-5 space-y-4">
          <div>
            <label
              className="block text-xs font-medium text-muted mb-1"
              htmlFor="rename-workspace-name"
            >
              Name
            </label>
            <input
              id="rename-workspace-name"
              autoFocus
              type="text"
              maxLength={10}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={[
                'w-full px-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted',
                'bg-bg border-[0.5px] border-[#1A1A1A]',
                'focus:outline-none focus:ring-2 focus:ring-accent'
              ].join(' ')}
            />
            {name && !nameValid && (
              <div className="mt-1 text-[12px] text-[#EF4444]">
                Letters and numbers only, 1-10 characters.
              </div>
            )}
          </div>

          <div>
            <label
              className="block text-xs font-medium text-muted mb-1"
              htmlFor="rename-workspace-icon"
            >
              Icon <span className="text-muted/70">(optional, 1 char)</span>
            </label>
            <input
              id="rename-workspace-icon"
              type="text"
              maxLength={1}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder={name ? name.charAt(0).toUpperCase() : ''}
              className={[
                'w-full px-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted',
                'bg-bg border-[0.5px] border-[#1A1A1A]',
                'focus:outline-none focus:ring-2 focus:ring-accent'
              ].join(' ')}
            />
            {icon && !iconValid && (
              <div className="mt-1 text-[12px] text-[#EF4444]">
                One letter or number only.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeModal}
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
            onClick={handleSave}
            disabled={!canSave}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-accent text-bg',
              'transition-opacity duration-150 hover:opacity-90',
              'disabled:opacity-40 disabled:cursor-default disabled:hover:opacity-40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
