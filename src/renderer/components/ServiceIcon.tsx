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
    : 'group-hover:ring-2 group-hover:ring-accent/50 group-focus-visible:ring-2 group-focus-visible:ring-accent';

  const showImg = Boolean(service.iconUrl) && !imgError;

  return (
    <button
      type="button"
      onClick={() => setActiveService(service.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(service.id, e.clientX, e.clientY);
      }}
      title={service.name}
      className="group flex flex-col items-center gap-[5px] shrink-0 focus:outline-none"
    >
      <div className="relative">
        <div
          className={[
            'w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center',
            'bg-bg text-fg text-xs font-semibold uppercase',
            'transition-all duration-150 ease-out group-hover:scale-105',
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
        </div>
        <Badge count={service.unreadCount} />
      </div>
      <span className="text-[11px] leading-tight text-muted max-w-[60px] truncate text-center">
        {service.name}
      </span>
    </button>
  );
}
