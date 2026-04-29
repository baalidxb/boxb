import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { EmptyState } from './components/EmptyState';
import { AddAppModal } from './components/AddAppModal';
import { ServiceWebView } from './components/ServiceWebView';
import { useServicesStore } from './store/services';

export default function App(): JSX.Element {
  const activeServiceId = useServicesStore((s) => s.activeServiceId);
  const services = useServicesStore((s) => s.services);
  const active = services.find((s) => s.id === activeServiceId);

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

      if (e.key === 'Escape' && state.isAddModalOpen) {
        e.preventDefault();
        state.closeAddModal();
        return;
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

  return (
    <div className="flex h-screen w-screen bg-bg text-fg overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        {active ? (
          <ServiceWebView key={active.id} service={active} />
        ) : (
          <EmptyState />
        )}
      </div>
      <AddAppModal />
    </div>
  );
}
