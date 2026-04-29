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
}

export function ServiceWebView({ service, isActive }: ServiceWebViewProps): JSX.Element {
  const ref = useRef<WebviewTag | null>(null);
  const lastSeenCountRef = useRef<number>(0);
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
    };
  }, [service.id, service.name, service.partition, preloadPath, setUnreadCount]);

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
        style={{ width: '100%', height: '100%', display: 'flex' }}
      />
    </div>
  );
}
