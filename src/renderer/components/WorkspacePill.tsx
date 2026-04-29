import type { Workspace } from '@shared/types';
import { workspaceDisplayChar } from '../store/services';

interface WorkspacePillProps {
  workspace: Workspace;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (x: number, y: number) => void;
}

export function WorkspacePill({
  workspace,
  isActive,
  onClick,
  onContextMenu
}: WorkspacePillProps): JSX.Element {
  const ringClass = isActive
    ? 'ring-2 ring-accent'
    : 'hover:ring-2 hover:ring-accent/50';

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      title={workspace.name}
      aria-label={`Workspace ${workspace.name}`}
      className={[
        'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
        'bg-bg text-fg text-[15px] font-semibold uppercase select-none',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ringClass
      ].join(' ')}
    >
      <span>{workspaceDisplayChar(workspace)}</span>
    </button>
  );
}
