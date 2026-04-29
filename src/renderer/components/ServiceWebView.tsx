import { useEffect, useRef, useState } from 'react';
import type { WebviewTag } from 'electron';
import type { Service } from '../store/services';
import { setActiveReloader } from '../lib/webview-controller';

interface ServiceWebViewProps {
  service: Service;
}

export function ServiceWebView({ service }: ServiceWebViewProps): JSX.Element {
  const ref = useRef<WebviewTag | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
      console.log(`${tag} page-title-updated title=${JSON.stringify(e.title)}`);
    };
    const onDomReady = (): void => {
      console.log(`${tag} dom-ready partition=${service.partition}`);
    };

    el.addEventListener('did-finish-load', onFinishLoad);
    el.addEventListener('did-fail-load', onFailLoad);
    el.addEventListener('page-title-updated', onTitleUpdate);
    el.addEventListener('dom-ready', onDomReady);

    setActiveReloader(() => el.reload());

    return () => {
      el.removeEventListener('did-finish-load', onFinishLoad);
      el.removeEventListener('did-fail-load', onFailLoad);
      el.removeEventListener('page-title-updated', onTitleUpdate);
      el.removeEventListener('dom-ready', onDomReady);
      setActiveReloader(null);
    };
  }, [service.id, service.name, service.partition]);

  return (
    <div className="flex-1 relative bg-bg">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      )}
      <webview
        ref={ref}
        src={service.url}
        partition={service.partition}
        {...(service.userAgent ? { useragent: service.userAgent } : {})}
        allowpopups="true"
        style={{ width: '100%', height: '100%', display: 'flex' }}
      />
    </div>
  );
}
