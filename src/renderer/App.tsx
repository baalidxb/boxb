import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { EmptyState } from './components/EmptyState';
import { AddAppModal } from './components/AddAppModal';
import { AddWorkspaceModal } from './components/AddWorkspaceModal';
import { RenameWorkspaceModal } from './components/RenameWorkspaceModal';
import { ConfirmDeleteWorkspaceModal } from './components/ConfirmDeleteWorkspaceModal';
import { ServiceWebView } from './components/ServiceWebView';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import { ConfirmRemoveModal } from './components/ConfirmRemoveModal';
import {
  applyBroadcastSnapshot,
  ensureWorkspacesInitialized,
  useServicesStore
} from './store/services';

export default function App(): JSX.Element {
  const activeServiceId = useServicesStore((s) => s.activeServiceId);
  const activeWorkspaceId = useServicesStore((s) => s.activeWorkspaceId);
  const services = useServicesStore((s) => s.services);
  const workspaces = useServicesStore((s) => s.workspaces);
  const contextMenu = useServicesStore((s) => s.contextMenu);
  const closeContextMenu = useServicesStore((s) => s.closeContextMenu);
  const requestRemove = useServicesStore((s) => s.requestRemove);
  const workspaceContextMenu = useServicesStore((s) => s.workspaceContextMenu);
  const closeWorkspaceContextMenu = useServicesStore(
    (s) => s.closeWorkspaceContextMenu
  );
  const openRenameWorkspace = useServicesStore((s) => s.openRenameWorkspace);
  const requestDeleteWorkspace = useServicesStore((s) => s.requestDeleteWorkspace);
  const reorderWorkspaces = useServicesStore((s) => s.reorderWorkspaces);

  // Run idempotent migration once persistence has hydrated. Creates the
  // "Main" workspace if missing and assigns it to any orphan services. If
  // this window was launched in locked mode (additionalArguments), seal
  // the lock right after migration so the activeWorkspaceId reflects it.
  useEffect(() => {
    const initLocked = (): void => {
      const lockedId = window.boxb.window.getLockedWorkspaceId();
      if (lockedId) {
        useServicesStore.getState().initLockedWorkspace(lockedId);
      }
    };
    if (useServicesStore.persist.hasHydrated()) {
      ensureWorkspacesInitialized();
      initLocked();
      return;
    }
    const unsub = useServicesStore.persist.onFinishHydration(() => {
      ensureWorkspacesInitialized();
      initLocked();
    });
    return unsub;
  }, []);

  // Multi-window state sync. Other windows broadcast their globals snapshot
  // (workspaces + services) here; we apply it under a guard so we don't
  // echo the apply back. Per-window state (activeWorkspaceId, modal flags)
  // is never broadcast and stays local.
  useEffect(() => {
    return window.boxb.window.onBroadcast((snapshot) => {
      applyBroadcastSnapshot(snapshot);
    });
  }, []);

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

      if (cmdOrCtrl && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        window.boxb.window.openNew();
        return;
      }

      if (cmdOrCtrl && e.shiftKey && (e.key === ']' || e.key === '}')) {
        if (state.lockedWorkspaceId) return;
        e.preventDefault();
        state.cycleWorkspace(1);
        return;
      }
      if (cmdOrCtrl && e.shiftKey && (e.key === '[' || e.key === '{')) {
        if (state.lockedWorkspaceId) return;
        e.preventDefault();
        state.cycleWorkspace(-1);
        return;
      }

      if (e.key === 'Escape') {
        if (state.confirmRemoveFor) {
          e.preventDefault();
          state.cancelRemove();
          return;
        }
        if (state.confirmDeleteWorkspaceFor) {
          e.preventDefault();
          state.cancelDeleteWorkspace();
          return;
        }
        if (state.renameWorkspaceFor) {
          e.preventDefault();
          state.closeRenameWorkspace();
          return;
        }
        if (state.isAddWorkspaceModalOpen) {
          e.preventDefault();
          state.closeAddWorkspaceModal();
          return;
        }
        if (state.contextMenu) {
          e.preventDefault();
          state.closeContextMenu();
          return;
        }
        if (state.workspaceContextMenu) {
          e.preventDefault();
          state.closeWorkspaceContextMenu();
          return;
        }
        if (state.isAddModalOpen) {
          e.preventDefault();
          state.closeAddModal();
          return;
        }
      }

      if (cmdOrCtrl && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const visible = state.services.filter(
          (s) => s.workspaceId === state.activeWorkspaceId
        );
        const svc = visible[idx];
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
  // Match partition to service id, switch active service, and switch to its
  // workspace so the user lands on the right pill.
  useEffect(() => {
    const unsubscribe = window.boxb.notification.onClick(({ partition }) => {
      const state = useServicesStore.getState();
      const svc = state.services.find((s) => s.partition === partition);
      if (!svc) return;
      if (svc.workspaceId && svc.workspaceId !== state.activeWorkspaceId) {
        state.setActiveWorkspace(svc.workspaceId);
      }
      state.setActiveService(svc.id);
    });
    return unsubscribe;
  }, []);

  const activeService = services.find((s) => s.id === activeServiceId);
  const showEmpty =
    !activeService || activeService.workspaceId !== activeWorkspaceId;

  const wsContextItems = ((): ContextMenuItem[] => {
    if (!workspaceContextMenu) return [];
    const ordered = [...workspaces].sort((a, b) => a.order - b.order);
    const idx = ordered.findIndex((w) => w.id === workspaceContextMenu.workspaceId);
    const isFirst = idx <= 0;
    const isLast = idx === ordered.length - 1;
    const isOnly = ordered.length <= 1;
    return [
      {
        type: 'item',
        label: 'Open in new window',
        onClick: () => {
          window.boxb.window.openNew(workspaceContextMenu.workspaceId);
          closeWorkspaceContextMenu();
        }
      },
      { type: 'divider' },
      {
        type: 'item',
        label: 'Rename',
        onClick: () => openRenameWorkspace(workspaceContextMenu.workspaceId)
      },
      {
        type: 'item',
        label: 'Delete',
        danger: true,
        disabled: isOnly,
        onClick: () => requestDeleteWorkspace(workspaceContextMenu.workspaceId)
      },
      { type: 'divider' },
      {
        type: 'item',
        label: 'Move Up',
        disabled: isFirst,
        onClick: () => {
          if (isFirst) return;
          const next = [...ordered];
          const tmp = next[idx - 1];
          const cur = next[idx];
          if (!tmp || !cur) return;
          next[idx - 1] = cur;
          next[idx] = tmp;
          reorderWorkspaces(next.map((w) => w.id));
          closeWorkspaceContextMenu();
        }
      },
      {
        type: 'item',
        label: 'Move Down',
        disabled: isLast,
        onClick: () => {
          if (isLast) return;
          const next = [...ordered];
          const tmp = next[idx + 1];
          const cur = next[idx];
          if (!tmp || !cur) return;
          next[idx + 1] = cur;
          next[idx] = tmp;
          reorderWorkspaces(next.map((w) => w.id));
          closeWorkspaceContextMenu();
        }
      }
    ];
  })();

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
              isActive={
                s.id === activeServiceId && s.workspaceId === activeWorkspaceId
              }
            />
          ))}
          {showEmpty && (
            <div className="absolute inset-0 z-10">
              <EmptyState />
            </div>
          )}
        </div>
      </div>
      <AddAppModal />
      <AddWorkspaceModal />
      <RenameWorkspaceModal />
      <ConfirmDeleteWorkspaceModal />
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
      {workspaceContextMenu && (
        <ContextMenu
          x={workspaceContextMenu.x}
          y={workspaceContextMenu.y}
          onClose={closeWorkspaceContextMenu}
          items={wsContextItems}
        />
      )}
      <ConfirmRemoveModal />
    </div>
  );
}
