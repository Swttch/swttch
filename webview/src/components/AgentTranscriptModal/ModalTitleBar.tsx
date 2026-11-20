import type { ReactNode } from 'react';
import { ChevronLeftIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';
import { Tooltip } from '@/components/Tooltip';
import { SIDE_PANEL_HEADER_CLASS, TITLE_ICON_BUTTON_CLASS, type RunSurface } from './RunViewControls';

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
  /** Buttons that sit before the close button. */
  actions?: ReactNode;
  /** Something that sits right after the title, e.g. how the task is doing. */
  afterTitle?: ReactNode;
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
  page: 'flex items-center justify-between gap-2 px-4 py-2 flex-shrink-0 border-b border-border-subtle',
};

/**
 * The title row every run view starts with: the task's name and the close
 * button. Shared by the subagent, workflow and Bash views so the three cannot
 * drift apart.
 */
export function ModalTitleBar(props: Props) {
  const { task, onClose, onBack, backLabel, actions, afterTitle, onTitleClick, surface = 'modal' } = props;
  const compact = surface === 'panel';
  const { t } = useTranslation('chat');

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
  const heading = afterTitle ? (
    <div className="flex min-w-0 items-center gap-1.5">
      {title}
      {afterTitle}
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
    <div className={ROW_CLASS[surface]}>
      {backButton ? (
        <div className="flex min-w-0 items-center gap-1">
          {backButton}
          {heading}
        </div>
      ) : (
        heading
      )}
      {actions ? (
        <div className="flex items-center gap-1 shrink-0">
          {actions}
          {closeButton}
        </div>
      ) : (
        closeButton
      )}
    </div>
  );
}
