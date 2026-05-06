import { useEffect, useRef, useState } from 'react';
import type { WebviewTag } from 'electron';
import {
  registerPartitionOnce,
  useServicesStore,
  type Service
} from '../store/services';
import { setActiveReloader } from '../lib/webview-controller';
import { parseUnreadCount } from '../utils/parseUnreadCount';

interface ServiceWebViewProps {
  service: Service;
  isActive: boolean;
  // True when the per-window hibernation set contains this service AND the
  // service is in aggressive mode. Causes the entire <webview> subtree to
  // unmount; remount happens when wakeService removes it from the set.
  aggressiveHibernated: boolean;
}

export function ServiceWebView({
  service,
  isActive,
  aggressiveHibernated
}: ServiceWebViewProps): JSX.Element | null {
  if (aggressiveHibernated) {
    // Aggressive hibernation: unmount entirely. Inner WebContents is
    // destroyed; main's hibernation tracker drops the entry via the
    // 'destroyed' handler. Re-mount happens when wakeService runs (typically
    // from setActiveService).
    return null;
  }
  return <ServiceWebViewInner service={service} isActive={isActive} />;
}

interface InnerProps {
  service: Service;
  isActive: boolean;
}

function ServiceWebViewInner({ service, isActive }: InnerProps): JSX.Element {
  const ref = useRef<WebviewTag | null>(null);
  const lastSeenCountRef = useRef<number>(0);
  const wcIdRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [preloadPath, setPreloadPath] = useState<string | null>(null);
  const setUnreadCount = useServicesStore((s) => s.setUnreadCount);

  useEffect(() => {
    let cancelled = false;
    window.boxb.service
      .getWebviewPreloadPath()
      .then((p) => {
        if (!cancelled) setPreloadPath(p);
      })
      .catch((e) => console.error('[webview] preload path lookup failed', e));
    return () => {
      cancelled = true;
    };
  }, []);

  // Listener effect: always-on. Keeps badges (page-title-updated) and
  // notifications working even when the webview is display:none in the
  // background, because the listeners are bound to the same DOM element
  // for the whole life of the service.
  useEffect(() => {
    const el = ref.current;
    if (!el || !preloadPath) return;

    const tag = `[webview ${service.name}]`;

    const onFinishLoad = (): void => {
      setLoading(false);
      console.log(`${tag} did-finish-load`);
    };
    const onFailLoad = (event: Event): void => {
      const e = event as Event & {
        errorCode?: number;
        errorDescription?: string;
        validatedURL?: string;
        isMainFrame?: boolean;
      };
      if (e.isMainFrame === false) return;
      console.error(
        `${tag} did-fail-load code=${e.errorCode} desc=${e.errorDescription} url=${e.validatedURL}`
      );
    };
    const onTitleUpdate = (event: Event): void => {
      const e = event as Event & { title?: string };
      const title = e.title ?? '';
      const newCount = parseUnreadCount(title);
      console.log(
        '[BoxB] title-updated:',
        service.name,
        '→',
        title,
        'parsed count:',
        newCount,
        'lastSeen:',
        lastSeenCountRef.current
      );
      // Only dispatch if the count differs from what we last sent. Comparing
      // against a local ref (not the store) avoids creating a subscription
      // that could re-fire this listener.
      if (newCount !== lastSeenCountRef.current) {
        lastSeenCountRef.current = newCount;
        // Defer to the next tick so we never call setState during a render
        // cycle that may be in flight (e.g., during initial webview attach).
        setTimeout(() => setUnreadCount(service.id, newCount), 0);
      }
    };
    const onDomReady = (): void => {
      console.log(`${tag} dom-ready partition=${service.partition}`);
      registerPartitionOnce(service.partition);
      // Register this webview with the main-side hibernation tracker.
      // dom-ready is the right moment: the inner WebContents now exists and
      // has an id we can address.
      try {
        const wcId = el.getWebContentsId();
        wcIdRef.current = wcId;
        // Read the LIVE active state from the store rather than the closed-
        // over isActive prop; this listener was created when isActive may
        // have been false even though the user already clicked the tile.
        const liveActive =
          useServicesStore.getState().activeServiceId === service.id;
        window.boxb.hibernation.register({
          wcId,
          partition: service.partition,
          serviceId: service.id,
          hibernation: service.hibernation,
          isActive: liveActive
        });
      } catch (err) {
        console.error('[hibernation] register failed', err);
      }
    };

    el.addEventListener('did-finish-load', onFinishLoad);
    el.addEventListener('did-fail-load', onFailLoad);
    el.addEventListener('page-title-updated', onTitleUpdate);
    el.addEventListener('dom-ready', onDomReady);

    return () => {
      el.removeEventListener('did-finish-load', onFinishLoad);
      el.removeEventListener('did-fail-load', onFailLoad);
      el.removeEventListener('page-title-updated', onTitleUpdate);
      el.removeEventListener('dom-ready', onDomReady);
      // Tell main this webview is going away (unmount on aggressive
      // hibernation, service removal, or window close). Main already
      // listens for 'destroyed' on the WebContents itself, but emitting
      // unregister on cleanup gives us a faster, deterministic signal.
      const wcId = wcIdRef.current;
      if (wcId !== null) {
        try {
          window.boxb.hibernation.unregister({ wcId });
        } catch {
          // best-effort
        }
        wcIdRef.current = null;
      }
    };
  }, [
    service.id,
    service.name,
    service.partition,
    service.hibernation,
    preloadPath,
    setUnreadCount
  ]);

  // Active-state effect: tells main when this webview becomes active /
  // inactive. The main-side handler bumps lastActiveAt on activation and
  // auto-thaws the page world if it was light-frozen.
  useEffect(() => {
    const wcId = wcIdRef.current;
    if (wcId === null) return; // not yet registered (dom-ready hasn't fired)
    try {
      window.boxb.hibernation.markActive({ wcId, isActive });
    } catch {
      // best-effort
    }
  }, [isActive]);

  // Reloader effect: only the active webview registers its reload() so the
  // TopBar Refresh button targets the right one.
  useEffect(() => {
    const el = ref.current;
    if (!el || !preloadPath || !isActive) return;
    setActiveReloader(() => el.reload());
    return () => setActiveReloader(null);
  }, [isActive, preloadPath]);

  if (!preloadPath) {
    return (
      <div
        className="absolute inset-0 bg-bg flex items-center justify-center"
        style={{ display: isActive ? 'flex' : 'none' }}
      >
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  // Webview tag's preload attribute requires a file:// URL absolute path.
  const preloadUrl = preloadPath.startsWith('file://')
    ? preloadPath
    : 'file:///' + preloadPath.replace(/\\/g, '/');

  return (
    <div
      className="absolute inset-0 bg-bg"
      style={{ display: isActive ? 'block' : 'none' }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      )}
      <webview
        ref={ref}
        src={service.url}
        partition={service.partition}
        preload={preloadUrl}
        {...(service.userAgent ? { useragent: service.userAgent } : {})}
        allowpopups="true"
        spellCheck
        style={{ width: '100%', height: '100%', display: 'flex' }}
      />
    </div>
  );
}
