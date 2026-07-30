import { CollapseToggle } from './CollapseToggle';

interface Props {
  /** What the panel is still waiting on, e.g. the permission title. */
  title: string;
  onExpand: () => void;
}

/**
 * The one-line trace a collapsed prompt panel leaves behind, so the user can
 * see what still needs an answer and bring it back with one tap.
 */
export const CollapsedSummaryBar = (props: Props) => {
  const { title, onExpand } = props;

  return (
    <div className="rounded-lg border border-border-default bg-surface-raised flex items-center gap-2 ps-3 pe-1.5 py-1.5">
      <button
        type="button"
        onClick={onExpand}
        className="min-w-0 flex-1 text-start text-[0.9230rem] text-text-secondary hover:text-text-primary cursor-pointer transition-colors truncate"
      >
        {title}
      </button>
      <CollapseToggle collapsed onToggle={onExpand} />
    </div>
  );
};
