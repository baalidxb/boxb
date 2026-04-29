import { useServicesStore } from '../store/services';
import { Logo } from './Logo';
import { ServiceIcon } from './ServiceIcon';
import { WorkspacePill } from './WorkspacePill';
import { GearIcon, PlusIcon } from './Icons';

export function Sidebar(): JSX.Element {
  const services = useServicesStore((s) => s.services);
  const activeServiceId = useServicesStore((s) => s.activeServiceId);
  const workspaces = useServicesStore((s) => s.workspaces);
  const activeWorkspaceId = useServicesStore((s) => s.activeWorkspaceId);
  const lockedWorkspaceId = useServicesStore((s) => s.lockedWorkspaceId);
  const setActiveWorkspace = useServicesStore((s) => s.setActiveWorkspace);
  const openWorkspaceContextMenu = useServicesStore(
    (s) => s.openWorkspaceContextMenu
  );
  const openAddWorkspaceModal = useServicesStore((s) => s.openAddWorkspaceModal);
  const openAddModal = useServicesStore((s) => s.openAddModal);
  const setActiveService = useServicesStore((s) => s.setActiveService);

  const isLocked = lockedWorkspaceId !== null;
  const orderedWorkspaces = [...workspaces].sort((a, b) => a.order - b.order);
  const visibleServices = services.filter(
    (s) => s.workspaceId === activeWorkspaceId
  );

  return (
    <aside className="w-[68px] h-screen shrink-0 bg-surface border-r-[0.5px] border-r-[#1A1A1A] flex flex-col">
      <div className="flex items-center justify-center pt-[14px] pb-[14px]">
        <button
          type="button"
          onClick={() => setActiveService(null)}
          title="Home"
          aria-label="Home"
          className={[
            'cursor-pointer rounded',
            'transition-opacity duration-150 ease-out hover:opacity-80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          ].join(' ')}
        >
          <Logo size={40} />
        </button>
      </div>

      <div className="border-t-[0.5px] border-t-[#1A1A1A]" />

      {!isLocked && (
        <>
          <div className="flex flex-col items-center pt-[10px] gap-[10px] shrink-0">
            {orderedWorkspaces.map((w) => (
              <WorkspacePill
                key={w.id}
                workspace={w}
                isActive={w.id === activeWorkspaceId}
                onClick={() => setActiveWorkspace(w.id)}
                onContextMenu={(x, y) => openWorkspaceContextMenu(w.id, x, y)}
              />
            ))}
            <button
              type="button"
              onClick={openAddWorkspaceModal}
              aria-label="Add workspace"
              title="Add workspace"
              className={[
                'w-8 h-8 rounded-full flex items-center justify-center text-muted shrink-0',
                'border-[0.5px] border-transparent',
                'transition-all duration-150 ease-out',
                'hover:text-accent hover:border-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              ].join(' ')}
            >
              <PlusIcon size={16} />
            </button>
          </div>

          <div className="border-t-[0.5px] border-t-[#1A1A1A] mt-[12px]" />
        </>
      )}

      <div className="overflow-y-auto flex flex-col items-center pt-[12px] gap-[10px] flex-1 min-h-0">
        {visibleServices.map((svc) => (
          <ServiceIcon key={svc.id} service={svc} active={svc.id === activeServiceId} />
        ))}
      </div>

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
