import { useState } from 'react';
import { useServicesStore, type Service } from '../store/services';

interface ServiceIconProps {
  service: Service;
  active: boolean;
}

function Badge({ count }: { count: number }): JSX.Element | null {
  if (count === 0) return null;
  if (count === -1) {
    return (
      <span
        className="absolute -top-1 -right-1 z-10 w-[10px] h-[10px] rounded-full bg-[#EF4444] border border-surface"
        aria-label="has unread"
      />
    );
  }
  const label = count > 99 ? '99+' : String(count);
  return (
    <span
      className={[
        'absolute -top-1 -right-1 z-10',
        'h-[18px] min-w-[18px] px-1 rounded-full',
        'bg-[#EF4444] text-white text-[11px] font-medium leading-none',
        'flex items-center justify-center border border-surface'
      ].join(' ')}
      aria-label={`${label} unread`}
    >
      {label}
    </span>
  );
}

export function ServiceIcon({ service, active }: ServiceIconProps): JSX.Element {
  const setActiveService = useServicesStore((s) => s.setActiveService);
  const openContextMenu = useServicesStore((s) => s.openContextMenu);
  const [imgError, setImgError] = useState(false);

  const ringClass = active
    ? 'ring-2 ring-accent'
    : 'hover:ring-2 hover:ring-accent/50';

  const showImg = Boolean(service.iconUrl) && !imgError;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setActiveService(service.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(service.id, e.clientX, e.clientY);
        }}
        title={service.name}
        className={[
          'w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center',
          'bg-bg text-fg text-xs font-semibold uppercase',
          'transition-all duration-150 ease-out hover:scale-105',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ringClass
        ].join(' ')}
      >
        {showImg ? (
          <img
            src={service.iconUrl}
            alt={service.name}
            className="w-7 h-7"
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{service.name.slice(0, 2)}</span>
        )}
      </button>
      <Badge count={service.unreadCount} />
    </div>
  );
}
