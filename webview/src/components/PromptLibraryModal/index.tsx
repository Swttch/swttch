import { useEffect, useRef, useState } from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import {
  INSERT_PROMPT_EVENT,
  type InsertPromptDetail,
} from '@/commandPalette/sections/context/items';
import type { PromptScope, SavedPrompt } from '@/types/prompt';
import { usePromptStore } from './usePromptStore';
import { PromptList, buildPromptRows } from './PromptList';
import { PromptForm } from './PromptForm';

interface Props {
  onClose: () => void;
  /** Open straight on the create screen, for the "create" row of the `!!` panel. */
  initialView?: 'list' | 'create';
}

type View =
  | { kind: 'list' }
  | { kind: 'create'; scope: PromptScope }
  | { kind: 'edit'; scope: PromptScope; prompt: SavedPrompt };

/**
 * The prompt library: where saved phrases are written, edited and removed.
 *
 * An overlay modal rather than a settings page, and reached from the command
 * palette's Context section, because the library is something the user reaches
 * for mid-conversation — the same way they reach for MCP servers. Its chrome
 * deliberately mirrors {@link McpModal} so the two read as one kind of screen.
 */
export function PromptLibraryModal({ onClose, initialView = 'list' }: Props) {
  const { t } = useTranslation('common');
  const { workingDirectory } = useWorkingDir();
  const { confirmDialog, confirm } = useConfirmDialog();
  const store = usePromptStore();

  // The create screen starts on global scope and lets the user change it there:
  // a prompt reached for from the composer is usually one they want everywhere,
  // and project scope does not exist at all when no project is open.
  const [view, setView] = useState<View>(
    initialView === 'create' ? { kind: 'create', scope: 'global' } : { kind: 'list' },
  );
  const [formBusy, setFormBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The cards in the order they are drawn, which is also the order the arrow
  // keys walk. Built from one definition so the two cannot disagree.
  const rows = buildPromptRows(store.globalPrompts, store.projectPrompts);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // A reload can shorten the list under the selection — deleting the last card
  // is the everyday way — so pull it back inside the list rather than leaving it
  // pointing past the end, where Enter would do nothing and the highlight would
  // vanish with no way to tell why.
  const boundedIndex = rows.length === 0 ? -1 : Math.min(selectedIndex, rows.length - 1);
  const selectedRow = boundedIndex === -1 ? null : rows[boundedIndex] ?? null;

  /**
   * Whether an Enter press is one the user started here, on this screen.
   *
   * Holding Enter on the Save button kept firing auto-repeat keydowns; the save
   * switched the modal to the list mid-hold, and the next repeat was read as
   * "use the selected prompt" — one physical press doing two things (issue
   * #430). Arming only on keyup makes a press count once: a keystroke that began
   * before this screen appeared can never act on it, whichever screen it was.
   */
  const enterArmed = useRef(false);
  useEffect(() => { enterArmed.current = false; }, [view.kind]);
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Enter') enterArmed.current = true;
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, []);

  /** Put a saved prompt in the composer, which is what picking one means. */
  const usePrompt = (content: string) => {
    onClose();
    // After the close, so the modal's focus trap has released the composer and
    // the insert lands where the user can see it.
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent<InsertPromptDetail>(INSERT_PROMPT_EVENT, { detail: { content } }),
      );
    }, 0);
  };

  // Focus trap for the lifetime of the modal, mirroring McpModal: the composer
  // underneath runs auto-focus timers that pull focus back to itself whenever
  // activeElement falls to document.body, which happens the moment a
  // non-focusable area inside this modal is clicked.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) {
        dialog.focus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (formBusy) return; // locked while a save is in flight
        if (view.kind !== 'list') {
          setView({ kind: 'list' });
        } else {
          onClose();
        }
        return;
      }

      // Arrow navigation belongs to the list only. While a form is open the
      // arrows move the caret inside the name and content fields, which is what
      // the user means by them there.
      if (view.kind !== 'list' || formBusy || rows.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (Math.min(prev, rows.length - 1) + 1) % rows.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (Math.min(prev, rows.length - 1) - 1 + rows.length) % rows.length);
        return;
      }
      if (e.key === 'Enter') {
        if (!selectedRow || !enterArmed.current) return;
        e.preventDefault();
        usePrompt(selectedRow.prompt.content);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, view, formBusy, rows.length, selectedRow]);

  const handleCreate = async (scope: PromptScope, name: string, content: string) => {
    await store.create(scope, name, content);
    setView({ kind: 'list' });
  };

  const handleUpdate = async (scope: PromptScope, id: string, name: string, content: string) => {
    await store.update(scope, id, name, content);
    setView({ kind: 'list' });
  };

  const handleDelete = async (scope: PromptScope, prompt: SavedPrompt) => {
    const confirmed = await confirm({
      title: t('promptLibrary.deleteTitle'),
      message: t('promptLibrary.deleteMessage', { name: prompt.name }),
      confirmLabel: t('promptLibrary.delete'),
      variant: 'danger',
    });
    if (!confirmed) return;
    await store.remove(scope, prompt.id);
  };

  const isListView = view.kind === 'list';

  return (
    <Portal>
      {confirmDialog}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (formBusy) return; // locked while a save is in flight
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={`w-full max-w-lg bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none ${formBusy ? 'pointer-events-none' : ''}`}
          style={{ maxHeight: '50rem', minHeight: '32rem' }}
        >
          {isListView && (
            <>
              <div className="flex items-center justify-between px-4 pt-4 pb-1 flex-shrink-0">
                <h2 className="text-lg font-semibold text-text-primary">{t('promptLibrary.title')}</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setView({ kind: 'create', scope: 'global' })}
                    className="w-8 h-8 flex items-center justify-center rounded text-text-tertiary hover:bg-surface-hover transition-colors"
                    title={t('promptLibrary.addPrompt')}
                    aria-label={t('promptLibrary.addPrompt')}
                  >
                    <PlusIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded text-text-tertiary hover:bg-surface-hover transition-colors"
                    aria-label={t('promptLibrary.cancel')}
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <p className="px-4 pb-2 text-xs text-text-tertiary flex-shrink-0">
                {t('promptLibrary.description')}
              </p>
            </>
          )}

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {isListView && store.loading && (
              <div className="flex-1 flex items-center justify-center text-sm text-text-tertiary">
                {t('promptLibrary.loading')}
              </div>
            )}
            {isListView && !store.loading && store.error && (
              <div className="flex-1 flex items-center justify-center px-4">
                <p className="text-sm text-state-error-fg text-center">{t('promptLibrary.loadFailed')}</p>
              </div>
            )}
            {isListView && !store.loading && !store.error && (
              <PromptList
                globalPrompts={store.globalPrompts}
                projectPrompts={store.projectPrompts}
                projectAvailable={store.projectAvailable}
                workingDirectory={workingDirectory}
                selectedId={selectedRow?.prompt.id ?? null}
                onUse={(prompt) => usePrompt(prompt.content)}
                onEdit={(scope, prompt) => setView({ kind: 'edit', scope, prompt })}
                onDelete={(scope, prompt) => void handleDelete(scope, prompt)}
              />
            )}
            {view.kind === 'create' && (
              <PromptForm
                scope={view.scope}
                onScopeChange={(scope) => setView({ kind: 'create', scope })}
                projectAvailable={store.projectAvailable}
                onSubmit={(name, content) => handleCreate(view.scope, name, content)}
                onCancel={() => setView({ kind: 'list' })}
                onBusyChange={setFormBusy}
              />
            )}
            {view.kind === 'edit' && (
              <PromptForm
                key={view.prompt.id}
                editing={view.prompt}
                scope={view.scope}
                projectAvailable={store.projectAvailable}
                onSubmit={(name, content) => handleUpdate(view.scope, view.prompt.id, name, content)}
                onCancel={() => setView({ kind: 'list' })}
                onBusyChange={setFormBusy}
              />
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
