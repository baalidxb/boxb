// v0.2.2: per-service zoom steps — the same ladder Chrome uses, trimmed to
// a sensible range for chat/web apps.
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export const DEFAULT_ZOOM = 1;

export function nextZoom(current: number | undefined, direction: 'in' | 'out' | 'reset'): number {
  if (direction === 'reset') return DEFAULT_ZOOM;
  const z = typeof current === 'number' && Number.isFinite(current) ? current : DEFAULT_ZOOM;
  if (direction === 'in') {
    for (const s of ZOOM_STEPS) if (s > z + 0.001) return s;
    return ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    const s = ZOOM_STEPS[i]!;
    if (s < z - 0.001) return s;
  }
  return ZOOM_STEPS[0]!;
}

export function zoomPercent(z: number | undefined): number {
  return Math.round((z ?? DEFAULT_ZOOM) * 100);
}
