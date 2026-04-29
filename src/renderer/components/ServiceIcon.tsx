import { useState } from 'react';
import { useServicesStore, type Service } from '../store/services';

interface ServiceIconProps {
  service: Service;
  active: boolean;
}

export function ServiceIcon({ service, active }: ServiceIconProps): JSX.Element {
  const setActiveService = useServicesStore((s) => s.setActiveService);
  const [imgError, setImgError] = useState(false);

  const ringClass = active
    ? 'ring-2 ring-accent'
    : 'hover:ring-2 hover:ring-accent/50';

  const showImg = Boolean(service.iconUrl) && !imgError;

  return (
    <button
      type="button"
      onClick={() => setActiveService(service.id)}
      title={service.name}
      className={[
        'w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0',
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
  );
}
