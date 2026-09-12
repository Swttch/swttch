import { useEffect, useRef, useState } from 'react';
import { BookmarkIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { basename } from '@/pages/ChatPage/ChatInput/basename';
import type { PromptScope, SavedPrompt } from '@/types/prompt';

/** One card of the list, together with the scope its section belongs to. */
export interface PromptRow {
  scope: PromptScope;
  prompt: SavedPrompt;
}

/**
 * The cards in the order they appear on screen, global section first.
 *
 * Arrow-key navigation walks this list while the sections render from it, so the
 * two can never disagree about what "the next card" is — the order is defined
 * once, here, rather than once per consumer.
 */
export function buildPromptRows(
  globalPrompts: SavedPrompt[],
  projectPrompts: SavedPrompt[],
): PromptRow[] {
  return [
    ...globalPrompts.map((prompt): PromptRow => ({ scope: 'global', prompt })),
    ...projectPrompts.map((prompt): PromptRow => ({ scope: 'project', prompt })),
  ];
}

interface Props {
  globalPrompts: SavedPrompt[];
  projectPrompts: SavedPrompt[];
  /** False when no project is open, so the project section explains itself instead. */
  projectAvailable: boolean;
  /** The open project's path, for the project section heading. */
  workingDirectory: string | null | undefined;
  /** The card the arrow keys currently sit on, or null when the list is empty. */
  selectedId: string | null;
  /** Put this prompt in the composer, which is what picking a card means. */
  onUse: (prompt: SavedPrompt) => void;
  onEdit: (scope: PromptScope, prompt: SavedPrompt) => void;
  onDelete: (scope: PromptScope, prompt: SavedPrompt) => void;
  /** Open the export picker for this scope. Absent when there is nothing to export. */
  onExport?: (scope: PromptScope) => void;
  /** Read a file into this scope. Absent when the scope cannot be written. */
  onImport?: (scope: PromptScope) => void;
}

/** A one-line preview of the prompt's text, shown under its name on the card. */
function preview(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

interface SectionProps {
  title: string;
  scope: PromptScope;
  prompts: SavedPrompt[];
  /** Shown in place of the list when the section cannot be written to. */
  unavailableNote?: string;
  selectedId: string | null;
  onUse: (prompt: SavedPrompt) => void;
  onEdit: (scope: PromptScope, prompt: SavedPrompt) => void;
  onDelete: (scope: PromptScope, prompt: SavedPrompt) => void;
  /** Open the export picker for this scope. Absent when there is nothing to export. */
  onExport?: (scope: PromptScope) => void;
  /** Read a file into this scope. Absent when the scope cannot be written. */
  onImport?: (scope: PromptScope) => void;
}

/**
 * One scope's heading and cards.
 *
 * The heading carries no create button of its own: the modal's header already
 * has one, and the create form asks which scope to save to, so a button per
 * section would be a second way to say the same thing.
 *
 * Export and import do sit here, because unlike create they are about one
 * scope's file. "Export" with no scope would have to ask which one, which is the
 * question this placement already answers.
 */
function PromptSection(props: SectionProps) {
  const { title, scope, prompts, unavailableNote, selectedId, onUse, onEdit, onDelete, onExport, onImport } =
    props;
  const { t } = useTranslation('common');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the kebab menu on a click anywhere outside it. Registered a tick late
  // so the very mousedown that opened the menu does not immediately close it.
  useEffect(() => {
    if (openMenuId === null) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuId]);

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="truncate text-sm font-semibold text-text-secondary">{title}</span>
        <span className="flex flex-shrink-0 items-center gap-1">
          {onExport && prompts.length > 0 && (
            <button
              type="button"
              onClick={() => onExport(scope)}
              className="rounded px-2 py-1 text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              {t('promptLibrary.transfer.export')}
            </button>
          )}
          {onImport && (
            <button
              type="button"
              onClick={() => onImport(scope)}
              className="rounded px-2 py-1 text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              {t('promptLibrary.transfer.import')}
            </button>
          )}
        </span>
      </div>

      {unavailableNote ? (
        <p className="px-1 py-3 text-sm text-text-tertiary">{unavailableNote}</p>
      ) : prompts.length === 0 ? (
        <p className="px-1 py-3 text-sm text-text-tertiary">{t('promptLibrary.empty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              data-prompt-id={prompt.id}
              className={`flex items-center gap-3 rounded-lg border bg-surface-base p-3 ${
                prompt.id === selectedId
                  ? 'border-border-focus bg-surface-selected'
                  : 'border-border-default'
              }`}
            >
              {/* The card body is the "use this prompt" button: picking a prompt
                  here has to mean what picking one in the `!!` panel means, and
                  that is putting its text in the composer. Editing stays behind
                  the kebab, so the everyday action is the one click away. */}
              <button
                type="button"
                onClick={() => onUse(prompt)}
                className="flex min-w-0 flex-1 items-center gap-3 text-start"
              >
                {/* The icon sits in a square tile of its own, so the two text lines
                    beside it read as one block rather than as text wrapped around
                    a loose glyph. */}
                <span className="flex flex-shrink-0 items-center justify-center w-9 h-9 rounded-lg bg-surface-overlay text-text-tertiary">
                  <BookmarkIcon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text-primary truncate">{prompt.name}</span>
                  {/* Tippy rather than the native `title`: a `title` tooltip does
                      not render at all inside the JCEF WebView the plugin embeds,
                      so the IDE user would get nothing. */}
                  <Tooltip content={prompt.content}>
                    <span className="block text-xs text-text-tertiary truncate">
                      {preview(prompt.content)}
                    </span>
                  </Tooltip>
                </span>
              </button>
              <div className="relative flex-shrink-0" ref={openMenuId === prompt.id ? menuRef : null}>
                <button
                  type="button"
                  onClick={() => setOpenMenuId(openMenuId === prompt.id ? null : prompt.id)}
                  className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:bg-surface-hover"
                  title={t('promptLibrary.menu')}
                  aria-label={t('promptLibrary.menu')}
                  aria-haspopup="true"
                  aria-expanded={openMenuId === prompt.id}
                >
                  <EllipsisVerticalIcon className="w-4 h-4" />
                </button>
                {openMenuId === prompt.id && (
                  <div
                    role="menu"
                    className="absolute end-0 top-full z-10 mt-1 min-w-28 overflow-hidden rounded-md border border-border-default bg-surface-overlay shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOpenMenuId(null); onEdit(scope, prompt); }}
                      className="w-full px-3 py-1.5 text-start text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    >
                      {t('promptLibrary.edit')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOpenMenuId(null); onDelete(scope, prompt); }}
                      className="w-full px-3 py-1.5 text-start text-xs text-text-secondary hover:bg-surface-hover hover:text-state-error-fg"
                    >
                      {t('promptLibrary.delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The two scope sections of the prompt library, stacked on one screen.
 *
 * Stacked rather than behind a scope switch so the user sees everything they
 * have saved at once — the `!!` panel offers both scopes together too, and a
 * screen that hides half of them would not match what typing `!!` shows.
 */
export function PromptList(props: Props) {
  const {
    globalPrompts,
    projectPrompts,
    projectAvailable,
    workingDirectory,
    selectedId,
    onUse,
    onEdit,
    onDelete,
    onExport,
    onImport,
  } = props;
  const { t } = useTranslation('common');
  const scrollRef = useRef<HTMLDivElement>(null);

  const projectName = workingDirectory ? basename(workingDirectory) : '';

  // Keep the arrow-key selection on screen once the list is long enough to
  // scroll, the same way the `!!` panel and the model picker do.
  useEffect(() => {
    if (selectedId === null) return;
    const card = scrollRef.current?.querySelector(`[data-prompt-id="${CSS.escape(selectedId)}"]`);
    card?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2">
      <PromptSection
        title={t('promptLibrary.globalSection')}
        scope="global"
        prompts={globalPrompts}
        selectedId={selectedId}
        onUse={onUse}
        onEdit={onEdit}
        onDelete={onDelete}
        onExport={onExport}
        onImport={onImport}
      />
      <PromptSection
        title={
          projectName
            ? t('promptLibrary.projectSectionNamed', { projectName })
            : t('promptLibrary.projectSection')
        }
        scope="project"
        prompts={projectPrompts}
        unavailableNote={projectAvailable ? undefined : t('promptLibrary.projectUnavailable')}
        selectedId={selectedId}
        onUse={onUse}
        onEdit={onEdit}
        onExport={projectAvailable ? onExport : undefined}
        onImport={projectAvailable ? onImport : undefined}
        onDelete={onDelete}
      />
    </div>
  );
}
