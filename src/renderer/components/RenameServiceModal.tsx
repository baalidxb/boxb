import { useEffect, useState } from 'react';
import {
  isValidServiceName,
  SERVICE_NAME_MAX,
  useServicesStore
} from '../store/services';

export function RenameServiceModal(): JSX.Element | null {
  const id = useServicesStore((s) => s.renameServiceFor);
  const services = useServicesStore((s) => s.services);
  const closeModal = useServicesStore((s) => s.closeRenameService);
  const renameService = useServicesStore((s) => s.renameService);
  const target = services.find((s) => s.id === id);

  const [name, setName] = useState('');

  useEffect(() => {
    if (target) {
      setName(target.name);
    } else {
      setName('');
    }
  }, [target]);

  if (!id || !target) return null;

  const valid = isValidServiceName(name);

  const handleSave = (): void => {
    if (!valid) return;
    try {
      renameService(id, name);
      closeModal();
    } catch {
      // validation already prevents this; safe no-op
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
        aria-labelledby="rename-service-title"
      >
        <h2 id="rename-service-title" className="text-lg font-medium text-fg">
          Rename service
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Custom label shown below the tile. Clear the field and save to revert
          to the default.
        </p>

        <div className="mt-5">
          <label
            className="block text-xs font-medium text-muted mb-1"
            htmlFor="rename-service-name"
          >
            Label
          </label>
          <input
            id="rename-service-name"
            autoFocus
            type="text"
            maxLength={SERVICE_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={target.defaultName}
            className={[
              'w-full px-3 py-2.5 rounded-lg text-sm text-fg placeholder:text-muted',
              'bg-bg border-[0.5px] border-[#1A1A1A]',
              'focus:outline-none focus:ring-2 focus:ring-accent'
            ].join(' ')}
          />
          {!valid && (
            <div className="mt-1 text-[12px] text-[#EF4444]">
              No tabs, line breaks, or other control characters.
            </div>
          )}
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
            disabled={!valid}
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
