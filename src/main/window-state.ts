import Store from 'electron-store';
import { screen } from 'electron';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1280,
  height: 800,
  isMaximized: false
};

const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

interface StoreSchema {
  state?: WindowState;
}

const store = new Store<StoreSchema>({ name: 'boxb-window' });

function intersectsAnyDisplay(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds;
    return (
      x < b.x + b.width &&
      x + width > b.x &&
      y < b.y + b.height &&
      y + height > b.y
    );
  });
}

export function loadWindowState(): WindowState {
  const saved = store.get('state');
  if (!saved) return DEFAULT_STATE;

  const width = Math.max(saved.width ?? DEFAULT_STATE.width, MIN_WIDTH);
  const height = Math.max(saved.height ?? DEFAULT_STATE.height, MIN_HEIGHT);

  if (
    typeof saved.x === 'number' &&
    typeof saved.y === 'number' &&
    !intersectsAnyDisplay(saved.x, saved.y, width, height)
  ) {
    // Saved bounds are off-screen (e.g. monitor disconnected).
    return { ...DEFAULT_STATE };
  }

  const next: WindowState = {
    width,
    height,
    isMaximized: Boolean(saved.isMaximized)
  };
  if (typeof saved.x === 'number') next.x = saved.x;
  if (typeof saved.y === 'number') next.y = saved.y;
  return next;
}

export function saveWindowState(state: WindowState): void {
  store.set('state', state);
}
