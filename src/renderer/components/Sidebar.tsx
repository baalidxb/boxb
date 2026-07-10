import { useEffect, useState } from 'react';
import { useServicesStore } from '../store/services';
import { useManagedStore } from '../store/managed';
import { useScannerStore } from '../store/scanner';
import { useRemindersStore } from '../store/reminders';
import { useCalendarStore } from '../store/calendar';
import { Logo } from './Logo';
import { ServiceIcon } from './ServiceIcon';
import { WorkspacePill } from './WorkspacePill';
import {
  BellIcon,
  CalendarIcon as CalendarGlyph,
  GearIcon,
  LockIcon,
  PlusIcon,
  ShieldIcon
} from './Icons';

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
  const isManaged = useManagedStore((s) => s.isManaged);
  const managedHydrated = useManagedStore((s) => s.hydrated);
  const securityOpen = useScannerStore((s) => s.panelOpen);
  const remindersOpen = useRemindersStore((s) => s.panelOpen);
  const reminders = useRemindersStore((s) => s.reminders);

  // Ticking "now" for the overdue badge — 30s granularity is plenty.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const overdueCount = reminders.filter((r) => r.dueAt <= now).length;

  const calendarOpen = useCalendarStore((s) => s.panelOpen);

  // The overlay panels (Security / Reminders / Calendar) are mutually
  // exclusive — opening one closes the others so they never stack invisibly.
  const toggleSecurity = (): void => {
    useRemindersStore.getState().closePanel();
    useCalendarStore.getState().closePanel();
    useScannerStore.getState().togglePanel();
  };
  const toggleReminders = (): void => {
    useScannerStore.getState().closePanel();
    useCalendarStore.getState().closePanel();
    useRemindersStore.getState().togglePanel();
  };
  const toggleCalendar = (): void => {
    useScannerStore.getState().closePanel();
    useRemindersStore.getState().closePanel();
    useCalendarStore.getState().togglePanel();
  };

  const isLocked = lockedWorkspaceId !== null;
  // Render the locked variant only after the managed store has hydrated —
  // otherwise admin installs would briefly flash the lock badge between
  // App mount and the IPC return (cosmetic but jarring).
  const showLockedAdd = managedHydrated && isManaged;
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

      {/* Phase 9.6: Security view toggle. Sits above the workspace pills and
          stays visible regardless of locked/managed state — scanning is a
          local developer tool, not part of the managed layout. */}
      <div className="flex items-center justify-center pt-[10px] shrink-0">
        <button
          type="button"
          onClick={toggleSecurity}
          aria-label="Security"
          aria-pressed={securityOpen}
          title="Security — secret scanner"
          className={[
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            'border-[0.5px] transition-all duration-150 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            securityOpen
              ? 'text-accent border-accent bg-accent/10'
              : 'text-muted border-transparent hover:text-accent hover:border-accent'
          ].join(' ')}
        >
          <ShieldIcon size={18} />
        </button>
      </div>

      {/* Phase 9.7: Reminders view toggle. Overdue count badges in gold. */}
      <div className="flex items-center justify-center pt-[10px] shrink-0">
        <button
          type="button"
          onClick={toggleReminders}
          aria-label="Reminders"
          aria-pressed={remindersOpen}
          title="Reminders and tasks"
          className={[
            'relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            'border-[0.5px] transition-all duration-150 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            remindersOpen
              ? 'text-accent border-accent bg-accent/10'
              : 'text-muted border-transparent hover:text-accent hover:border-accent'
          ].join(' ')}
        >
          <BellIcon size={18} />
          {overdueCount > 0 && (
            <span
              className={[
                'absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px]',
                'rounded-full bg-accent text-bg text-[9px] font-bold leading-none',
                'flex items-center justify-center pointer-events-none'
              ].join(' ')}
            >
              {overdueCount > 9 ? '9+' : overdueCount}
            </span>
          )}
        </button>
      </div>

      {/* Phase 9.8: Calendar view toggle. */}
      <div className="flex items-center justify-center pt-[10px] shrink-0">
        <button
          type="button"
          onClick={toggleCalendar}
          aria-label="Calendar"
          aria-pressed={calendarOpen}
          title="Calendar — unified agenda"
          className={[
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            'border-[0.5px] transition-all duration-150 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            calendarOpen
              ? 'text-accent border-accent bg-accent/10'
              : 'text-muted border-transparent hover:text-accent hover:border-accent'
          ].join(' ')}
        >
          <CalendarGlyph size={18} />
        </button>
      </div>

      {!isLocked && (
        <>
          <div
            data-tour="workspaces"
            className="flex flex-col items-center pt-[10px] gap-[10px] shrink-0"
          >
            {orderedWorkspaces.map((w) => (
              <WorkspacePill
                key={w.id}
                workspace={w}
                isActive={w.id === activeWorkspaceId}
                onClick={() => setActiveWorkspace(w.id)}
                onContextMenu={(x, y) => openWorkspaceContextMenu(w.id, x, y)}
              />
            ))}
            {/* Add workspace hidden in managed mode — workspaces are
                fixed by the admin's config. */}
            {!showLockedAdd && (
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
            )}
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
        {showLockedAdd ? (
          // Locked variant — visually present so users know this is where
          // they'd normally add a service, with a tooltip explaining why
          // it's unavailable. Click is intentionally a no-op.
          <button
            type="button"
            aria-label="This BoxB is managed by your admin. Contact them to add services."
            title="This BoxB is managed by your admin. Contact them to add services."
            className={[
              'relative w-10 h-10 rounded-lg flex items-center justify-center text-muted/60',
              'border-[0.5px] border-[#1A1A1A] cursor-default',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            ].join(' ')}
          >
            <PlusIcon size={20} />
            <LockIcon
              size={11}
              className="absolute -bottom-[2px] -right-[2px] bg-surface rounded-full p-[1px] text-accent"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={openAddModal}
            aria-label="Add app"
            data-tour="add-service"
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
        )}

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
