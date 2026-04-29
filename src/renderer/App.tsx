import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { EmptyState } from './components/EmptyState';
import { AddAppModal } from './components/AddAppModal';
import { ServiceWebView } from './components/ServiceWebView';
import { ContextMenu } from './components/ContextMenu';
import { ConfirmRemoveModal } from './components/ConfirmRemoveModal';
import { useServicesStore } from './store/services';

export default function App(): JSX.Element {
  const activeServiceId = useServicesStore((s) => s.activeServiceId);
  const services = useServicesStore((s) => s.services);
  const contextMenu = useServicesStore((s) => s.contextMenu);
  const closeContextMenu = useServicesStore((s) => s.closeContextMenu);
  const requestRemove = useServicesStore((s) => s.requestRemove);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      const state = useServicesStore.getState();

      if (cmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (state.isAddModalOpen) state.closeAddModal();
        else state.openAddModal();
        return;
      }

      if (e.key === 'Escape') {
        if (state.confirmRemoveFor) {
          e.preventDefault();
          state.cancelRemove();
          return;
        }
        if (state.contextMenu) {
          e.preventDefault();
          state.closeContextMenu();
          return;
        }
        if (state.isAddModalOpen) {
          e.preventDefault();
          state.closeAddModal();
          return;
        }
      }

      if (cmdOrCtrl && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const svc = state.services[idx];
        if (svc) {
          e.preventDefault();
          state.setActiveService(svc.id);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Native notification click → main brings window to front + sends partition.
  // Match partition to service id and switch active.
  useEffect(() => {
    const unsubscribe = window.boxb.notification.onClick(({ partition }) => {
      const state = useServicesStore.getState();
      const svc = state.services.find((s) => s.partition === partition);
      if (svc) state.setActiveService(svc.id);
    });
    return unsubscribe;
  }, []);

  return (
    <div className="flex h-screen w-screen bg-bg text-fg overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <div className="flex-1 relative">
          {services.map((s) => (
            <ServiceWebView
              key={s.id}
              service={s}
              isActive={s.id === activeServiceId}
            />
          ))}
          {!activeServiceId && (
            <div className="absolute inset-0 z-10">
              <EmptyState />
            </div>
          )}
        </div>
      </div>
      <AddAppModal />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={[
            {
              type: 'item',
              label: 'Remove',
              danger: true,
              onClick: () => requestRemove(contextMenu.serviceId)
            }
          ]}
        />
      )}
      <ConfirmRemoveModal />
    </div>
  );
}
