import { useEffect, useRef, useState } from 'react';
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
import { RenameServiceModal } from './components/RenameServiceModal';
import { TerminalPanel } from './components/TerminalPanel';
import { ExportConfigModal } from './components/ExportConfigModal';
import { ApplyManagedConfigModal } from './components/ApplyManagedConfigModal';
import { CommandBar } from './components/CommandBar';
import { SetApiKeyModal } from './components/SetApiKeyModal';
import { OnboardingTutorial } from './components/OnboardingTutorial';
import { HelpModal } from './components/HelpModal';
import { SecurityPanel } from './components/SecurityPanel';
import { RemindersPanel } from './components/RemindersPanel';
import { CalendarPanel } from './components/CalendarPanel';
import {
  applyBroadcastSnapshot,
  ensureWorkspacesInitialized,
  useServicesStore
} from './store/services';
import { useTerminalStore } from './store/terminal';
import { useManagedStore } from './store/managed';
import { useCommandBarStore } from './store/commandBar';
import { useOnboardingStore } from './store/onboarding';
import { useScannerStore } from './store/scanner';
import { useRemindersStore } from './store/reminders';
import { useCalendarStore } from './store/calendar';
import { catalog } from '../catalog/apps';
import type { CommandBarAction, ManagedConfigFile } from '@shared/types';

export default function App(): JSX.Element {
  const activeServiceId = useServicesStore((s) => s.activeServiceId);
  const activeWorkspaceId = useServicesStore((s) => s.activeWorkspaceId);
  const services = useServicesStore((s) => s.services);
  const workspaces = useServicesStore((s) => s.workspaces);
  const hibernatedServiceIds = useServicesStore((s) => s.hibernatedServiceIds);
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
  const openRenameService = useServicesStore((s) => s.openRenameService);
  const isManaged = useManagedStore((s) => s.isManaged);
  const securityPanelOpen = useScannerStore((s) => s.panelOpen);
  const remindersPanelOpen = useRemindersStore((s) => s.panelOpen);
  const calendarPanelOpen = useCalendarStore((s) => s.panelOpen);

  // Phase 9.1: per-window managed-mode UI state. Modal opens are local
  // to this window — the export modal is admin-only and never appears in
  // managed installs; the apply modal only appears at startup of a window
  // that picked up a launch config.
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<{
    config: ManagedConfigFile;
    isReplace: boolean;
  } | null>(null);
  // Phase 9.2: SetApiKeyModal opens via tray bridge (or rare in-app entry
  // point later). Local state mirrors the modal-open pattern used above.
  const [setApiKeyOpen, setSetApiKeyOpen] = useState(false);

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

  // Phase 9: hydrate the terminal panel state from boxb-window.json. If the
  // user had it open at last quit, this also spawns the first fresh tab.
  useEffect(() => {
    void useTerminalStore.getState().hydrate();
  }, []);

  // Phase 9.1: hydrate managed-mode state from boxb-managed.json, then
  // check whether the main process detected a launch config. Order matters:
  // we need the current managed state before deciding apply vs replace
  // vs silent-skip (same name as already applied).
  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      await useManagedStore.getState().hydrate();
      if (cancelled) return;
      try {
        const raw = (await window.boxb.managed.checkLaunchConfig()) as
          | ManagedConfigFile
          | null;
        if (!raw || cancelled) return;
        const current = useManagedStore.getState();
        if (current.isManaged && current.configName === raw.name) {
          // Identical name to the already-applied config — treat as a
          // re-prompt artifact (e.g. file still in drop folder) and clear
          // pending without bothering the user.
          await window.boxb.managed.cancelConfig();
          return;
        }
        setPendingConfig({
          config: raw,
          isReplace: current.isManaged
        });
      } catch {
        // best effort — no modal if main isn't ready / IPC fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tray "Export Managed Config…" → renderer opens the modal. Only the
  // primary window receives this event (main targets getMainWindow()).
  useEffect(() => {
    return window.boxb.managed.onOpenExportModal(() => {
      setExportOpen(true);
    });
  }, []);

  // Phase 9.2: hydrate the command-bar AI-availability flag once on mount
  // so the empty-state hint can choose between "Press Enter to ask AI"
  // and the no-AI fallback message without an extra IPC roundtrip.
  useEffect(() => {
    void useCommandBarStore.getState().hydrate();
  }, []);

  // Tray "Set Anthropic API Key…" → opens the SetApiKeyModal in the
  // primary window. Same bridge pattern as the export modal above.
  useEffect(() => {
    return window.boxb.ai.onOpenSetApiKeyModal(() => {
      setSetApiKeyOpen(true);
    });
  }, []);

  // Phase 9.6: hydrate the protected-repo list once on mount so the security
  // panel renders the user's repos immediately when toggled open.
  useEffect(() => {
    void useScannerStore.getState().hydrate();
  }, []);

  // Phase 9.7: hydrate reminders + todos on mount, and re-hydrate on every
  // main-side change broadcast (scheduler fired, toast button, another
  // window's panel). Keeps the bell badge live in all windows.
  useEffect(() => {
    void useRemindersStore.getState().hydrate();
    return window.boxb.reminders.onChanged(() => {
      void useRemindersStore.getState().hydrate();
    });
  }, []);

  // Phase 9.8: hydrate calendar sources on mount; re-list on change
  // broadcasts (source added/removed in another window).
  useEffect(() => {
    void useCalendarStore.getState().hydrate();
    return window.boxb.calendar.onChanged(() => {
      void useCalendarStore.getState().hydrate();
    });
  }, []);

  // Reminder toast click → focus the linked service (primary window only —
  // main targets getMainWindow()). Same switch-workspace-then-activate
  // dance as native notification clicks.
  useEffect(() => {
    return window.boxb.reminders.onFocusService(({ serviceId }) => {
      // Close overlay panels first — otherwise the activated service sits
      // hidden behind the Reminders/Security view (acceptance-test catch).
      useRemindersStore.getState().closePanel();
      useScannerStore.getState().closePanel();
      const state = useServicesStore.getState();
      const svc = state.services.find((s) => s.id === serviceId);
      if (!svc) return;
      if (svc.workspaceId && svc.workspaceId !== state.activeWorkspaceId) {
        state.setActiveWorkspace(svc.workspaceId);
      }
      state.setActiveService(svc.id);
    });
  }, []);

  // Reminder toast click (unlinked) / missed summary → open the panel.
  useEffect(() => {
    return window.boxb.reminders.onOpenPanel(() => {
      useScannerStore.getState().closePanel();
      useRemindersStore.getState().openPanel();
    });
  }, []);

  // Phase 9.5: first-launch onboarding tour. Auto-show only when:
  //   - this is the primary window (secondary windows never trigger it),
  //   - the tour hasn't already been completed/skipped on this install, and
  //   - the install isn't admin-managed (hard-lock managed users get a
  //     focused setup from their admin and don't need the full tour — every
  //     v1 managed config is hard-lock, so isManaged implies that here).
  // The help "?" button remains available in all cases. We await the managed
  // hydrate (idempotent) so the isManaged check is reliable before deciding.
  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      await useOnboardingStore.getState().hydrate();
      await useManagedStore.getState().hydrate();
      if (cancelled) return;
      const ob = useOnboardingStore.getState();
      if (ob.tutorialOpen || ob.hasCompletedTutorial) return;
      let isPrimary = true;
      try {
        isPrimary = window.boxb.window.isPrimaryWindow();
      } catch {
        // best effort — default to primary if the bridge call fails
      }
      if (!isPrimary) return;
      if (useManagedStore.getState().isManaged) return;
      ob.startTutorial();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Action executor: the command bar dispatches one of these per Enter.
  // Lives in App.tsx so it can reach all the right stores; CommandBar
  // itself stays presentation-only.
  const executeCommand = (action: CommandBarAction): void => {
    const svcState = useServicesStore.getState();
    const term = useTerminalStore.getState();
    switch (action.type) {
      case 'open-service':
        if (action.target) {
          const svc = svcState.services.find((s) => s.id === action.target);
          if (svc) {
            // Switch workspace too if the service belongs to a different one.
            if (svc.workspaceId && svc.workspaceId !== svcState.activeWorkspaceId) {
              svcState.setActiveWorkspace(svc.workspaceId);
            }
            svcState.setActiveService(svc.id);
          }
        }
        return;
      case 'switch-workspace':
        if (action.target) svcState.setActiveWorkspace(action.target);
        return;
      case 'toggle-terminal':
        void term.toggle();
        return;
      case 'hide':
        // Reuse existing tray hide path: closing the last visible window
        // hides to tray. Simpler than adding a new IPC just for this.
        try {
          window.boxb.window.forceClose();
        } catch {
          // best effort
        }
        return;
      case 'quit':
        try {
          window.boxb.app.quit();
        } catch {
          // best effort
        }
        return;
      case 'add-custom':
        if (!useManagedStore.getState().isManaged) {
          svcState.openAddModal();
        }
        return;
      case 'add-catalog-service': {
        // Phase 9.2.1: one-step add from catalog. Defends against managed
        // mode (rules already filter, but be safe) and against template
        // catalog entries reaching here (Jira/Jenkins need URL fill-in
        // via the modal, not a direct add).
        if (useManagedStore.getState().isManaged) return;
        if (!action.target) return;
        const entry = catalog.find((c) => c.id === action.target);
        if (!entry || entry.isTemplate) return;
        const id = svcState.addService({
          catalogId: entry.id,
          name: entry.name,
          iconUrl: entry.iconUrl,
          url: entry.url,
          hibernation: entry.hibernation,
          ...(entry.userAgent ? { userAgent: entry.userAgent } : {})
        });
        svcState.setActiveService(id);
        return;
      }
      case 'create-reminder': {
        // Phase 9.7: non-silent create → main shows a "Reminder set" toast,
        // which is the user's confirmation since the bar closes instantly.
        const r = action.reminder;
        if (!r || !r.text.trim()) return;
        void window.boxb.reminders.create({
          text: r.text.trim(),
          dueAt: r.dueAt,
          serviceId: null
        });
        return;
      }
      case 'add-custom-url': {
        if (useManagedStore.getState().isManaged) return;
        if (!action.target) return;
        const url = action.target;
        let host = '';
        try {
          host = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          // detectUrl already validated shape, but if the URL parses
          // weird at execute time just bail rather than create a junk tile.
          return;
        }
        if (!host) return;
        const iconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
        const id = svcState.addService({
          catalogId: 'custom',
          name: host,
          iconUrl,
          url,
          hibernation: 'aggressive'
        });
        svcState.setActiveService(id);
        return;
      }
    }
  };

  // Ref to the terminal panel root so we can answer "does the terminal have
  // focus right now" by checking document.activeElement containment. Only
  // populated when the panel is open.
  const terminalPanelRef = useRef<HTMLDivElement | null>(null);
  const terminalHasFocus = (): boolean => {
    const root = terminalPanelRef.current;
    if (!root) return false;
    const active = document.activeElement;
    return active instanceof Node && root.contains(active);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      const state = useServicesStore.getState();
      const term = useTerminalStore.getState();

      // Ctrl+` / Ctrl+J: toggle the terminal panel. Two shortcuts because
      // backtick is unreachable on some non-US keyboard layouts; Ctrl+J
      // mirrors VS Code's terminal toggle and works on every layout. Both
      // use e.code (KeyJ / Backquote) so layout remapping doesn't break
      // them. Doesn't fire when a webview has focus — that's an existing
      // platform limitation, same as Ctrl+K.
      if (
        cmdOrCtrl &&
        !e.shiftKey &&
        (e.code === 'Backquote' || e.code === 'KeyJ')
      ) {
        e.preventDefault();
        void term.toggle();
        return;
      }
      // Ctrl+Shift+` / Ctrl+Shift+J: new terminal tab. Only when the panel
      // is open — otherwise we'd silently spawn an off-screen pty.
      if (
        cmdOrCtrl &&
        e.shiftKey &&
        (e.code === 'Backquote' || e.code === 'KeyJ')
      ) {
        if (!term.open) return;
        e.preventDefault();
        void term.addTab();
        return;
      }
      // Ctrl+W: close current terminal tab — only if terminal panel is
      // focused. Otherwise don't intercept (webviews handle it themselves).
      if (cmdOrCtrl && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        if (!term.open || !term.activeTabId) return;
        if (!terminalHasFocus()) return;
        e.preventDefault();
        term.closeTab(term.activeTabId);
        return;
      }
      // Ctrl+Tab: cycle tabs forward (Ctrl+Shift+Tab cycles back). Only
      // active when terminal has focus so we don't fight any future host-
      // level tab cycling.
      if (cmdOrCtrl && e.key === 'Tab') {
        if (!term.open || term.tabs.length <= 1) return;
        if (!terminalHasFocus()) return;
        e.preventDefault();
        term.cycleTab(e.shiftKey ? -1 : 1);
        return;
      }

      // Ctrl+K (Cmd+K on macOS): open the command bar. Replaces the
      // Phase 3 behavior where Ctrl+K opened AddAppModal directly —
      // "add custom URL" is now reachable via the bar's add-custom action.
      if (cmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const cmd = useCommandBarStore.getState();
        if (cmd.open) cmd.close();
        else cmd.open_();
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
        // Help modal sits above everything else (z-90) — close it first.
        // The tutorial overlay intentionally has no Esc binding; users exit
        // it via the explicit "Skip Tutorial"/"Done" buttons.
        const onboarding = useOnboardingStore.getState();
        if (onboarding.helpOpen) {
          e.preventDefault();
          onboarding.closeHelp();
          return;
        }
        const scanner = useScannerStore.getState();
        if (scanner.pendingConflictPath) {
          // Conflict modal is up — Esc aborts the replace, not the panel.
          e.preventDefault();
          scanner.cancelReplaceHook();
          return;
        }
        if (scanner.panelOpen) {
          e.preventDefault();
          scanner.closePanel();
          return;
        }
        const remindersState = useRemindersStore.getState();
        if (remindersState.panelOpen) {
          e.preventDefault();
          remindersState.closePanel();
          return;
        }
        const calendarState = useCalendarStore.getState();
        if (calendarState.panelOpen) {
          e.preventDefault();
          calendarState.closePanel();
          return;
        }
        // Command bar gets first dibs — its own input also handles Esc,
        // but if focus has slipped this is the safety net.
        const cmd = useCommandBarStore.getState();
        if (cmd.open) {
          e.preventDefault();
          cmd.close();
          return;
        }
        if (state.confirmRemoveFor) {
          e.preventDefault();
          state.cancelRemove();
          return;
        }
        if (state.renameServiceFor) {
          e.preventDefault();
          state.closeRenameService();
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

  // Main → renderer: the hibernation tracker decided to aggressive-hibernate
  // a service in this window. Add to the per-window set so ServiceWebView
  // unmounts the inner <webview>.
  useEffect(() => {
    const unsubscribe = window.boxb.hibernation.onRequestUnmount(
      ({ serviceId }) => {
        useServicesStore.getState().hibernateService(serviceId);
      }
    );
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
    const items: ContextMenuItem[] = [
      {
        type: 'item',
        label: 'Open in new window',
        onClick: () => {
          window.boxb.window.openNew(workspaceContextMenu.workspaceId);
          closeWorkspaceContextMenu();
        }
      }
    ];
    // Phase 9.1: in managed mode the team member can't rename or delete
    // admin-defined workspaces. Move Up/Down is also gated — workspace
    // ordering is part of the locked layout.
    if (!isManaged) {
      items.push({ type: 'divider' });
      items.push({
        type: 'item',
        label: 'Rename',
        onClick: () => openRenameWorkspace(workspaceContextMenu.workspaceId)
      });
      items.push({
        type: 'item',
        label: 'Delete',
        danger: true,
        disabled: isOnly,
        onClick: () => requestDeleteWorkspace(workspaceContextMenu.workspaceId)
      });
      items.push({ type: 'divider' });
      items.push({
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
      });
      items.push({
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
      });
    }
    return items;
  })();

  return (
    <div className="flex h-screen w-screen bg-bg text-fg overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        {/* Services area shrinks to make room when the terminal panel
            opens. min-h-0 lets flex-1 actually shrink below the natural
            content size (here: zero, since children are absolute). */}
        <div className="flex-1 min-h-0 relative">
          {services.map((s) => (
            <ServiceWebView
              key={s.id}
              service={s}
              isActive={
                s.id === activeServiceId && s.workspaceId === activeWorkspaceId
              }
              aggressiveHibernated={
                s.hibernation === 'aggressive' && hibernatedServiceIds.has(s.id)
              }
            />
          ))}
          {showEmpty && (
            <div className="absolute inset-0 z-10">
              <EmptyState />
            </div>
          )}
          {/* Phase 9.6: Security view replaces the service area while open.
              Rendered over (not instead of) the webviews so toggling back
              doesn't reload any service. */}
          {securityPanelOpen && <SecurityPanel />}
          {/* Phase 9.7: Reminders view — same overlay pattern. The sidebar
              toggles make Security and Reminders mutually exclusive. */}
          {remindersPanelOpen && <RemindersPanel />}
          {calendarPanelOpen && <CalendarPanel />}
        </div>
        <TerminalPanel ref={terminalPanelRef} />
      </div>
      <AddAppModal />
      <AddWorkspaceModal />
      <RenameWorkspaceModal />
      <ConfirmDeleteWorkspaceModal />
      {/* Service right-click menu suppressed entirely in managed mode —
          both Rename and Remove are admin-controlled, so an empty menu
          would just be visual noise. */}
      {contextMenu && !isManaged && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={[
            {
              type: 'item',
              label: 'Rename',
              onClick: () => openRenameService(contextMenu.serviceId)
            },
            { type: 'divider' },
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
      <RenameServiceModal />
      {/* Phase 9.1 export modal — admin only. The tray hides "Export
          Managed Config…" once the install is managed, so this should
          never open in a managed install, but the !isManaged guard is
          defensive. */}
      {!isManaged && (
        <ExportConfigModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
      )}
      {/* Apply modal: shown once per launch when main detected a config
          file (CLI flag, file association argv, or drop folder). */}
      {pendingConfig && (
        <ApplyManagedConfigModal
          config={pendingConfig.config}
          isReplace={pendingConfig.isReplace}
          onClose={() => setPendingConfig(null)}
        />
      )}
      {/* Phase 9.2 command bar — Ctrl+K toggle. Renders above all other
          modals because it should be reachable even when one is up
          (though pragmatically it won't be — most modals own focus). */}
      <CommandBar onExecute={executeCommand} />
      {/* SetApiKeyModal — admin-only, opened from tray. Hidden in
          managed mode for the same reason the tray item is hidden. */}
      {!isManaged && (
        <SetApiKeyModal isOpen={setApiKeyOpen} onClose={() => setSetApiKeyOpen(false)} />
      )}
      {/* Phase 9.5 onboarding. The tutorial overlay self-gates on its store's
          tutorialOpen flag (auto-shown once on first launch in the primary,
          non-managed window). The help modal is reachable anytime via the
          TopBar "?" button, including in managed installs. */}
      <OnboardingTutorial />
      <HelpModal />
    </div>
  );
}
