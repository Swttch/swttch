import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronLeftIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { Tooltip } from '@/components/Tooltip';
import { SIDE_PANEL_HEADER_CLASS, TITLE_ICON_BUTTON_CLASS, isCompactSurface, runTitleLevelFor, type RunSurface, type RunTitleLevel } from './RunViewControls';

interface Props {
  task: WorkflowTask;
  /** Omitted where a view is not a window of its own and has nothing to close. */
  onClose?: () => void;
  /**
   * When given, a back chevron sits before the title and calls this. Where it
   * goes depends on where the view is shown (back to the session from a page,
   * back to the task list from the side panel), so whoever mounts the view
   * decides; a window has nowhere to go back to and passes nothing.
   */
  onBack?: () => void;
  /** What the back chevron says it does, for its tooltip and for screen readers. */
  backLabel?: string;
  /**
   * Buttons that sit before the close button. A function is given how narrow the row is (see {@link RunTitleLevel}),
   * so it can put some of them in a "More" menu instead.
   */
  actions?: ReactNode | ((level: RunTitleLevel) => ReactNode);
  /** Something that sits right after the title, e.g. how the task is doing. Given the level the same way. */
  afterTitle?: ReactNode | ((level: RunTitleLevel) => ReactNode);
  /**
   * Clicking the title logs the task object this view was built from, so what
   * the CLI actually sends for a single Agent/Task can be read in full. Logged
   * as the object, not a string, so the console can be expanded field by field.
   */
  onTitleClick?: () => void;
  /**
   * Where the row is drawn. `modal` (the default) is the window's own row; `panel` has the height and sides of the
   * session's top bar and a title as small as the desktop app's; `page` is a page's row, with a rule under it.
   */
  surface?: RunSurface;
}

const ROW_CLASS: Record<RunSurface, string> = {
  modal: 'flex items-center justify-between gap-2 px-4 pt-4 pb-2 flex-shrink-0',
  panel: SIDE_PANEL_HEADER_CLASS,
  // A page's row is the panel's row: the same component, so the same size and padding.
  page: SIDE_PANEL_HEADER_CLASS,
};

/**
 * How narrow the row is, by its own width and not by where it is drawn: the side panel is narrow and the window is
 * wide, but a window on a phone is narrow too, and a wide panel has room. Before the row has a width to measure (it is
 * not laid out yet), the surface's usual answer stands.
 *
 * - 420px and up: 0, every control laid out, no "More".
 * - below 420: 1, "More" appears and takes the short/detailed switch.
 * - below 380: 2, the place menu goes into "More" too; the new-tab button stays.
 * - below 320: 3, everything is in "More".
 */
function useTitleLevel(surface: RunSurface): { ref: RefObject<HTMLDivElement>; level: RunTitleLevel } {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<RunTitleLevel | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setMeasured(runTitleLevelFor(width));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, level: measured ?? (isCompactSurface(surface) ? 3 : 0) };
}

/**
 * The title row every run view starts with: the task's name and the close
 * button. Shared by the subagent, workflow and Bash views so the three cannot
 * drift apart.
 */
export function ModalTitleBar(props: Props) {
  const { task, onClose, onBack, backLabel, actions, afterTitle, onTitleClick, surface = 'modal' } = props;
  const compact = isCompactSurface(surface);
  const { t } = useTranslation('chat');
  const { ref, level } = useTitleLevel(surface);
  const actionsNode = typeof actions === 'function' ? actions(level) : actions;
  const afterTitleNode = typeof afterTitle === 'function' ? afterTitle(level) : afterTitle;

  const closeButton = onClose && (
    <button
      onClick={onClose}
      className={TITLE_ICON_BUTTON_CLASS}
      title={t('backgroundTasks.close')}
    >
      <XMarkIcon className="w-5 h-5" />
    </button>
  );

  const title = (
    <h2
      className={`${compact ? 'text-[0.9375rem] font-medium' : 'text-lg font-semibold'} text-text-primary truncate min-w-0`}
      onClick={onTitleClick}
    >
      {t('backgroundTasks.transcriptModal.title', { name: task.name })}
    </h2>
  );
  const heading = afterTitleNode ? (
    <div className="flex min-w-0 items-center gap-1.5">
      {title}
      {afterTitleNode}
    </div>
  ) : (
    title
  );

  const backButton = onBack && (
    <Tooltip content={backLabel} placement="bottom">
      <button type="button" onClick={onBack} aria-label={backLabel} className={TITLE_ICON_BUTTON_CLASS}>
        <ChevronLeftIcon className="w-5 h-5" />
      </button>
    </Tooltip>
  );

  return (
    <div ref={ref} className={ROW_CLASS[surface]}>
      {backButton ? (
        <div className="flex min-w-0 items-center gap-1">
          {backButton}
          {heading}
        </div>
      ) : (
        heading
      )}
      {actionsNode ? (
        <div className="flex items-center gap-1 shrink-0">
          {actionsNode}
          {closeButton}
        </div>
      ) : (
        closeButton
      )}
    </div>
  );
}
