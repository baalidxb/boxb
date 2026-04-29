import { useServicesStore } from '../store/services';
import { Logo } from './Logo';
import { ServiceIcon } from './ServiceIcon';
import { GearIcon, PlusIcon } from './Icons';

export function Sidebar(): JSX.Element {
  const services = useServicesStore((s) => s.services);
  const activeServiceId = useServicesStore((s) => s.activeServiceId);
  const openAddModal = useServicesStore((s) => s.openAddModal);

  return (
    <aside className="w-[68px] h-screen shrink-0 bg-surface border-r-[0.5px] border-r-[#1A1A1A] flex flex-col">
      <div className="flex items-center justify-center pt-[14px] pb-[14px]">
        <Logo size={40} />
      </div>

      <div className="border-t-[0.5px] border-t-[#1A1A1A]" />

      <div className="overflow-y-auto flex flex-col items-center pt-[10px] gap-[10px]">
        {services.map((svc) => (
          <ServiceIcon key={svc.id} service={svc} active={svc.id === activeServiceId} />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center pb-[14px] gap-2">
        <button
          type="button"
          onClick={openAddModal}
          aria-label="Add app"
          className={[
            'w-10 h-10 rounded-lg flex items-center justify-center text-muted',
            'border-[0.5px] border-transparent',
            'transition-all duration-150 ease-out',
            'hover:text-accent hover:border-accent',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          ].join(' ')}
        >
          <PlusIcon size={20} />
        </button>

        <button
          type="button"
          aria-label="Settings"
          className={[
            'w-8 h-8 flex items-center justify-center text-muted',
            'transition-colors duration-150 ease-out hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded'
          ].join(' ')}
        >
          <GearIcon size={18} />
        </button>
      </div>
    </aside>
  );
}
