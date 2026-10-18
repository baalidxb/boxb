// v0.2.2: maps a <webview>'s inner WebContents id to the service it shows,
// so a main-process event that only knows "webContents 37" (zoom keys
// pressed inside that page) can be routed to the right service. Per-window;
// ServiceWebView registers on dom-ready and unregisters on unmount.

const byWcId = new Map<number, string>();

export function registerWebview(wcId: number, serviceId: string): void {
  byWcId.set(wcId, serviceId);
}

export function unregisterWebview(wcId: number): void {
  byWcId.delete(wcId);
}

export function serviceIdForWebContents(wcId: number): string | null {
  return byWcId.get(wcId) ?? null;
}
