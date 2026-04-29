import { useServicesStore } from '../store/services';
import { Logo } from './Logo';

export function EmptyState(): JSX.Element {
  const openAddModal = useServicesStore((s) => s.openAddModal);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-bg">
      <Logo size={64} />
      <div className="mt-4 text-lg font-medium text-fg">One hive for everything</div>
      <div className="mt-2 text-[13px] text-muted">Press + to add your first app</div>
      <button
        type="button"
        onClick={openAddModal}
        className={[
          'mt-6 px-4 py-2 rounded-lg text-sm font-medium text-accent',
          'border border-accent',
          'transition-colors duration-150 ease-out hover:bg-accent hover:text-bg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        ].join(' ')}
      >
        Add an app
      </button>
    </div>
  );
}
