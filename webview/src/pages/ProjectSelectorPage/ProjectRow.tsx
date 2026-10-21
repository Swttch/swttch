import { KeyboardEvent, MouseEvent, useEffect, useRef } from 'react';
import { ChatBubbleLeftIcon, FolderIcon, TrashIcon } from '@heroicons/react/24/outline';
import { MarqueeText } from './MarqueeText';
import { ProjectRowMenu } from './ProjectRowMenu';
import { projectBadgeStyle, projectInitials } from './projectBadge';
import { useProjectDelete } from './useProjectDelete';
import { Tooltip } from '@/components/Tooltip';
import { abbreviateHomeDir } from '@/shared';
import { useTranslation } from '@/i18n';

interface Props {
  /** The real, unedited folder name. */
  name: string;
  /** Display alias, if the user set one. Falls back to [name] when absent. */
  alias?: string;
  description?: string;
  path: string;
  sessionCount: number;
  /** The project's folder is no longer on disk. */
  folderMissing: boolean;
  /** Home directory of the machine the paths were recorded on, when known. */
  homeDir: string | null;
  /** True for the row the keyboard is currently on. */
  isActive: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  /** Deletes the project's session records; resolves to whether it succeeded. */
  onDelete: () => Promise<boolean>;
  /** Sets (or clears) the alias/description; resolves to whether it saved. */
  onSaveMeta: (fields: { name: string; description: string }) => Promise<boolean>;
}

export function ProjectRow(props: Props) {
  const {
    name,
    alias,
    description,
    path,
    sessionCount,
    folderMissing,
    homeDir,
    isActive,
    isFavorite,
    onSelect,
    onToggleFavorite,
    onDelete,
    onSaveMeta,
  } = props;
  const { t } = useTranslation('projectSelector');
  const ref = useRef<HTMLDivElement>(null);

  // Wherever the real name would otherwise appear — the label, the badge
  // letters — the alias takes its place instead, exactly as item 2 asked.
  const shownName = alias || name;

  // A row whose folder is gone is muted as a whole (avatar, name, path, session
  // count); only the delete badge keeps full strength, since it is the one thing
  // on the row worth acting on.
  const dim = folderMissing ? ' opacity-20' : '';

  // Keep the keyboard cursor on screen. Arrow keys move it while focus stays in
  // the search box, so nothing else would scroll the row into view.
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  // The confirm dialog is rendered beside the open button, not inside it, so
  // clicks in the dialog never bubble into onSelect.
  const { confirmDialog, requestDelete } = useProjectDelete(shownName, onDelete);

  const favoriteLabel = isFavorite ? t('removeFavorite') : t('addFavorite');

  // Toggling the star must not also fire the row's onSelect, since the star
  // sits INSIDE the open button (see the note below) and a click bubbles
  // through it like any other descendant's would.
  const handleStarClick = (e: MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite();
  };
  const handleStarKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite();
  };

  // Same reasoning as the star: the badge sits INSIDE the open button, so its
  // click must not also open the project.
  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    void requestDelete();
  };
  const handleDeleteKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    void requestDelete();
  };

  return (
    <div
      ref={ref}
      data-active={isActive || undefined}
      className={`group flex items-start rounded-lg transition-colors ${
        isActive ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-3 py-2.5 text-start"
      >
        <span
          aria-hidden="true"
          style={projectBadgeStyle(path)}
          className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-xs font-semibold${dim}`}
        >
          {projectInitials(shownName)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1">
              <span className={`truncate text-sm font-medium text-text-primary${dim}`}>
                {shownName}
              </span>

              {/*
                A real <button> cannot contain another <button> — the parser
                closes the outer one the moment it sees the inner tag — so
                inline controls next to the name use a role="button" span (the
                star) or, here, a plain focusable span (the tooltip anchor)
                instead. Same reasoning as SessionItem's inline rename/delete
                actions.
              */}
              {description && (
                <Tooltip content={description}>
                  <span
                    tabIndex={0}
                    aria-label={t('descriptionIconLabel')}
                    className="flex flex-shrink-0 items-center justify-center rounded p-1 text-text-tertiary hover:text-text-primary"
                  >
                    <ChatBubbleLeftIcon className="h-3.5 w-3.5" />
                  </span>
                </Tooltip>
              )}

              <span
                role="button"
                tabIndex={0}
                onClick={handleStarClick}
                onKeyDown={handleStarKeyDown}
                aria-pressed={isFavorite}
                aria-label={favoriteLabel}
                title={favoriteLabel}
                // A pinned row keeps its star visible; the rest reveal one on
                // hover or when the keyboard cursor lands, so an unpinned list
                // stays quiet. An invisible star still takes up room, so it
                // goes last (after the folder-missing badge) instead of leaving
                // a gap between the name and the badge; it also means hovering
                // the row never moves the badge.
                className={`flex flex-shrink-0 items-center justify-center rounded p-1 transition-opacity hover:text-text-primary ${
                  isFavorite
                    ? 'text-accent-primary opacity-100'
                    : 'order-last text-text-tertiary opacity-0 focus:opacity-100 group-hover:opacity-100 group-data-[active]:opacity-100'
                }`}
              >
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill={isFavorite ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.48 3.5a.56.56 0 011.04 0l2.13 4.98 5.4.46c.5.04.7.66.32.99l-4.1 3.56 1.23 5.28c.11.49-.42.87-.85.61L12 16.6l-4.65 2.78c-.43.26-.96-.12-.85-.61l1.23-5.28-4.1-3.56a.56.56 0 01.32-.99l5.4-.46 2.13-4.98z"
                  />
                </svg>
              </span>

              {folderMissing && (
                // Opens below the badge: above it the tooltip lands on the
                // project name this badge belongs to.
                <Tooltip content={t('folderMissingHint')} placement="bottom">
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t('deleteConfirm.title')}
                    onClick={handleDeleteClick}
                    onKeyDown={handleDeleteKeyDown}
                    // The folder-with-a-slash icon and the trash icon share one
                    // grid cell, so swapping them on hover never nudges the
                    // star or the name beside it.
                    className="group/badge inline-grid flex-shrink-0 cursor-pointer rounded bg-state-error-bg p-1 text-state-error-fg transition-colors hover:brightness-125 focus:brightness-125"
                  >
                    <span
                      aria-hidden="true"
                      className="relative col-start-1 row-start-1 group-hover/badge:invisible group-focus/badge:invisible"
                    >
                      <FolderIcon className="h-3.5 w-3.5" />
                      <svg
                        className="absolute inset-0 h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                      >
                        <path d="M4 3.5L20 20.5" />
                      </svg>
                    </span>
                    <TrashIcon
                      aria-hidden="true"
                      className="invisible col-start-1 row-start-1 h-3.5 w-3.5 group-hover/badge:visible group-focus/badge:visible"
                    />
                  </span>
                </Tooltip>
              )}
            </span>

            {sessionCount > 0 && (
              <span className={`flex-shrink-0 text-xs text-text-tertiary${dim}`}>
                {t('sessionCount', { count: sessionCount })}
              </span>
            )}
          </span>
          <MarqueeText
            text={abbreviateHomeDir(path, homeDir)}
            className={`text-[0.7692rem] text-text-tertiary ${
              folderMissing ? 'opacity-20' : 'group-hover:text-text-secondary'
            }`}
          />
        </span>
      </button>

      <ProjectRowMenu
        displayName={shownName}
        realName={name}
        currentName={alias ?? ''}
        currentDescription={description ?? ''}
        path={path}
        onDelete={onDelete}
        onSaveMeta={onSaveMeta}
      />

      {confirmDialog}
    </div>
  );
}
