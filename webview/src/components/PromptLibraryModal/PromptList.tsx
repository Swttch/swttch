import { useEffect, useRef } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BookmarkIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
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
 * Global leads because it is the library proper: the prompts a user keeps
 * everywhere, which is what they come here to tend. One section no longer
 * buries the other whichever way round they are, because each scrolls on its
 * own.
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
  /** Start a new prompt in this scope. Absent when the scope cannot be written. */
  onCreate?: (scope: PromptScope) => void;
}

/** A one-line preview of the prompt's text, shown under its name on the card. */
function preview(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

/**
 * Whether [prompt] answers [query], by name and by content.
 *
 * Content as well as name, the same way the `!!` panel matches: a user who
 * remembers a phrase but not the name they gave it still finds it. An empty
 * query matches everything, so the unfiltered list is the same code path.
 */
export function matchesPromptQuery(prompt: SavedPrompt, query: string): boolean {
  const lowered = query.trim().toLowerCase();
  if (lowered === '') return true;
  return (
    prompt.name.toLowerCase().includes(lowered) ||
    prompt.content.toLowerCase().includes(lowered)
  );
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
  /** Start a new prompt in this scope. Absent when the scope cannot be written. */
  onCreate?: (scope: PromptScope) => void;
}

/**
 * One scope's heading and cards.
 *
 * Create, export and import all sit on the heading, because all three are about
 * this scope's file. Put anywhere else they would have to ask which scope they
 * meant, and the heading has already answered that — which is why the create
 * form no longer carries a scope picker.
 */
function PromptSection(props: SectionProps) {
  const {
    title,
    scope,
    prompts,
    unavailableNote,
    selectedId,
    onUse,
    onEdit,
    onDelete,
    onExport,
    onImport,
    onCreate,
  } = props;
  const { t } = useTranslation('common');

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-2 flex flex-shrink-0 items-center justify-between gap-2 py-1.5">
        <span className="truncate text-sm font-semibold text-text-primary">{title}</span>
        {/* All three actions belong to one scope, so they sit on that scope's
            heading rather than on the modal's. Which file a prompt is written to
            is then answered by which row the button was on, and never asked
            again. */}
        <span className="flex flex-shrink-0 items-center gap-1.5">
          {onExport && prompts.length > 0 && (
            <button
              type="button"
              onClick={() => onExport(scope)}
              className="flex items-center gap-1 rounded-md border border-border-strong bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-hover"
            >
              <ArrowUpTrayIcon className="h-3.5 w-3.5" />
              {t('promptLibrary.transfer.export')}
            </button>
          )}
          {onImport && (
            <button
              type="button"
              onClick={() => onImport(scope)}
              className="flex items-center gap-1 rounded-md border border-border-strong bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-hover"
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
              {t('promptLibrary.transfer.import')}
            </button>
          )}
          {onCreate && (
            <button
              type="button"
              onClick={() => onCreate(scope)}
              className="flex items-center gap-1 rounded-md bg-accent-primary px-2.5 py-1 text-xs text-text-inverse transition-opacity hover:opacity-90"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t('promptLibrary.addPrompt')}
            </button>
          )}
        </span>
      </div>

      {/* An empty section is drawn as a card too, not as loose text. Bare text
          sat on nothing and started a few pixels in from the heading above it,
          so the section looked misaligned; a box gives it the same left edge and
          the same surface as the rows it will be replaced by. */}
      {unavailableNote ? (
        <div className="rounded-lg border border-border-subtle bg-surface-overlay px-3 py-3.5 text-sm text-text-secondary">
          {unavailableNote}
        </div>
      ) : prompts.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-overlay px-3 py-3.5">
          <span className="text-sm text-text-secondary">{t('promptLibrary.empty')}</span>
          {onCreate && (
            <button
              type="button"
              onClick={() => onCreate(scope)}
              className="flex-shrink-0 text-sm text-text-link underline-offset-2 hover:underline"
            >
              {t('promptLibrary.addPrompt')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex min-h-[5.5rem] flex-col gap-2 overflow-y-auto">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              data-prompt-id={prompt.id}
              /*
               * A card sits ON the panel, so it is drawn lighter than the panel
               * rather than darker. It used to be `surface-base`, which in the
               * dark theme is darker than the modal it sits in — the card read
               * as a hole and only the border held it together. `surface-overlay`
               * puts it above, and the border can then fall back to `subtle`,
               * which carries the light theme (where the two surfaces are five
               * shades apart) without boxing in the dark one.
               */
              className={`group flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                prompt.id === selectedId
                  ? 'border-border-focus bg-surface-selected'
                  : 'border-border-subtle bg-surface-overlay hover:bg-surface-hover'
              }`}
            >
              {/* The card body is the "use this prompt" button: picking a prompt
                  here has to mean what picking one in the `!!` panel means, and
                  that is putting its text in the composer. */}
              <button
                type="button"
                onClick={() => onUse(prompt)}
                className="flex min-w-0 flex-1 items-center gap-3 text-start"
              >
                {/* Bare, with no tile behind it, the way the `!!` panel draws the
                    same mark. The tile existed to bind two stacked lines into one
                    block; on a single line there is nothing to bind. */}
                <BookmarkIcon className="h-4 w-4 flex-shrink-0 text-text-tertiary" />
                {/* One line, laid out like the `!!` panel: the name takes a
                    quarter and carries the weight, the content takes the rest,
                    because the content is the thing about to be pasted. */}
                <span className="w-1/4 flex-shrink-0 truncate text-sm font-medium text-text-primary">
                  {prompt.name}
                </span>
                {/* Tippy rather than the native `title`: a `title` tooltip does
                    not render at all inside the JCEF WebView the plugin embeds,
                    so the IDE user would get nothing. */}
                <Tooltip content={prompt.content}>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                    {preview(prompt.content)}
                  </span>
                </Tooltip>
              </button>
              {/* Edit and delete as their own buttons: two everyday actions are
                  one click each rather than two. They stay on screen here,
                  unlike in the `!!` panel, because this is the screen a user
                  opens in order to tend the library — hiding its only two verbs
                  until the pointer finds them would be hiding the point.

                  Colour alone marks the hover. A filled hover state is a second
                  surface on top of the row's own, and on a selected row that
                  read as a hole punched in the highlight. */}
              <span className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onEdit(scope, prompt)}
                  className="rounded p-1 text-text-tertiary transition-colors hover:text-text-primary"
                  title={t('promptLibrary.edit')}
                  aria-label={t('promptLibrary.edit')}
                >
                  <PencilSquareIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(scope, prompt)}
                  className="rounded p-1 text-text-tertiary transition-colors hover:text-state-error-fg"
                  title={t('promptLibrary.delete')}
                  aria-label={t('promptLibrary.delete')}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </span>
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
    onCreate,
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
    /*
     * A column of sections that each scroll on their own, rather than one long
     * scroll holding both. With a single scroll, whichever scope was listed
     * first buried the other as soon as it grew — and both scopes grow. Here a
     * short section keeps its natural height and a long one shrinks and scrolls
     * inside itself, so both headings and some of both lists are always on
     * screen.
     */
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
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
        onCreate={onCreate}
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
        onCreate={projectAvailable ? onCreate : undefined}
        onDelete={onDelete}
      />
    </div>
  );
}
