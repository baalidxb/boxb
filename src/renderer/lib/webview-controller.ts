type Reloader = () => void;

let active: Reloader | null = null;

export function setActiveReloader(fn: Reloader | null): void {
  active = fn;
}

export function reloadActiveWebview(): void {
  active?.();
}
