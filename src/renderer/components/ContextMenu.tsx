import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem =
  | {
      type: 'item';
      label: string;
      onClick: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: 'divider' };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - 4) nx = window.innerWidth - rect.width - 4;
    if (ny + rect.height > window.innerHeight - 4) ny = window.innerHeight - rect.height - 4;
    if (nx < 4) nx = 4;
    if (ny < 4) ny = 4;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[60] min-w-[160px] bg-surface border-[0.5px] border-[#1A1A1A] rounded-lg p-[6px] shadow-lg"
    >
      {items.map((item, i) => {
        if (item.type === 'divider') {
          return (
            <div
              key={`d-${i}`}
              className="my-1 border-t-[0.5px] border-t-[#1A1A1A]"
              role="separator"
            />
          );
        }
        const colorClass = item.danger ? 'text-[#EF4444]' : 'text-fg';
        const interactionClass = item.disabled
          ? 'opacity-50 cursor-default'
          : 'hover:bg-[#1A1A1A] cursor-pointer';
        return (
          <button
            key={`i-${i}-${item.label}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
            }}
            className={[
              'w-full h-8 px-2 flex items-center text-[13px] rounded',
              'transition-colors duration-100',
              colorClass,
              interactionClass,
              'focus-visible:outline-none focus-visible:bg-[#1A1A1A]'
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
