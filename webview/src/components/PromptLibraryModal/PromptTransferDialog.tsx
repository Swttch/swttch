import { useState } from 'react';
import { useTranslation } from '@/i18n';
import type { ConflictStrategy, ImportItem, SavedPrompt } from '@/types/prompt';

/**
 * The two screens that move a prompt library in and out of a file.
 *
 * Both are checklists over the same kind of row, so they share a shell: a title,
 * a scrollable list of rows the user ticks, and a footer that says how many are
 * selected. Only the import screen adds the conflict strategy, because only it
 * can land on an id that is already stored.
 */

interface ShellProps {
  title: string;
  hint: string;
  /** Count line on the left of the footer. */
  summary: string;
  confirmLabel: string;
  confirmDisabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

function TransferShell({
  title,
  hint,
  summary,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  onCancel,
  children,
}: ShellProps) {
  const { t } = useTranslation('common');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        className="flex max-h-[80vh] w-[min(36rem,90vw)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-xl focus:outline-none"
      >
        <div className="flex-shrink-0 px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="mt-1 text-xs text-text-tertiary">{hint}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">{children}</div>

        <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 py-3">
          <span className="text-xs text-text-tertiary">{summary}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              {t('promptLibrary.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className="rounded-md bg-accent-primary px-3 py-1.5 text-sm text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  checked: boolean;
  onToggle: () => void;
  name: string;
  preview: string;
  /** Right-hand marker, used by the import screen for new/update. */
  badge?: string;
}

function TransferRow({ checked, onToggle, name, preview, badge }: RowProps) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-default bg-surface-base p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 flex-shrink-0 accent-accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{name}</span>
        <span className="block truncate text-xs text-text-tertiary">{preview}</span>
      </span>
      {badge && <span className="flex-shrink-0 text-xs text-text-tertiary">{badge}</span>}
    </label>
  );
}

/** Collapse whitespace so a multi-line prompt still fits one row. */
function preview(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

interface ExportProps {
  prompts: SavedPrompt[];
  onConfirm: (ids: string[]) => void;
  onCancel: () => void;
}

/** Pick which prompts go into the file. Everything is ticked to begin with. */
export function PromptExportDialog({ prompts, onConfirm, onCancel }: ExportProps) {
  const { t } = useTranslation('common');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(prompts.map((p) => p.id)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <TransferShell
      title={t('promptLibrary.transfer.exportTitle')}
      hint={t('promptLibrary.transfer.exportHint')}
      summary={t('promptLibrary.transfer.selectedCount', { count: selected.size })}
      confirmLabel={t('promptLibrary.transfer.exportConfirm')}
      confirmDisabled={selected.size === 0}
      onConfirm={() => onConfirm([...selected])}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-2">
        {prompts.map((prompt) => (
          <TransferRow
            key={prompt.id}
            checked={selected.has(prompt.id)}
            onToggle={() => toggle(prompt.id)}
            name={prompt.name}
            preview={preview(prompt.content)}
          />
        ))}
      </div>
    </TransferShell>
  );
}

interface ImportProps {
  items: ImportItem[];
  newCount: number;
  updateCount: number;
  onConfirm: (prompts: SavedPrompt[], strategy: ConflictStrategy) => void;
  onCancel: () => void;
}

const STRATEGIES: ConflictStrategy[] = ['skip', 'overwrite', 'duplicate'];

/**
 * Show what the chosen file would do, then let the user decide the conflicts.
 *
 * The strategy picker only appears when something actually conflicts: offering a
 * choice that changes nothing is a question the user has to read and answer for
 * no reason.
 */
export function PromptImportDialog({
  items,
  newCount,
  updateCount,
  onConfirm,
  onCancel,
}: ImportProps) {
  const { t } = useTranslation('common');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.map((item) => item.prompt.id)),
  );
  const [strategy, setStrategy] = useState<ConflictStrategy>('skip');

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = items.filter((item) => selected.has(item.prompt.id));
  const hasConflict = chosen.some((item) => item.status === 'update');

  const strategyClass = (isActive: boolean) =>
    `rounded px-3 py-1 text-sm transition-colors ${
      isActive ? 'bg-surface-hover text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
    }`;

  return (
    <TransferShell
      title={t('promptLibrary.transfer.importTitle')}
      hint={t('promptLibrary.transfer.importHint', { new: newCount, update: updateCount })}
      summary={t('promptLibrary.transfer.selectedCount', { count: chosen.length })}
      confirmLabel={t('promptLibrary.transfer.importConfirm')}
      confirmDisabled={chosen.length === 0}
      onConfirm={() => onConfirm(chosen.map((item) => item.prompt), strategy)}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <TransferRow
            key={item.prompt.id}
            checked={selected.has(item.prompt.id)}
            onToggle={() => toggle(item.prompt.id)}
            name={item.prompt.name}
            preview={preview(item.prompt.content)}
            badge={t(`promptLibrary.transfer.status.${item.status}`)}
          />
        ))}
      </div>

      {hasConflict && (
        <div className="mt-4">
          <span className="mb-1 block text-xs text-text-tertiary">
            {t('promptLibrary.transfer.strategyLabel')}
          </span>
          <div
            role="group"
            aria-label={t('promptLibrary.transfer.strategyLabel')}
            className="inline-flex items-center gap-0.5 rounded border border-border-default p-0.5"
          >
            {STRATEGIES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={strategy === option}
                onClick={() => setStrategy(option)}
                className={strategyClass(strategy === option)}
              >
                {t(`promptLibrary.transfer.strategy.${option}`)}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            {t(`promptLibrary.transfer.strategyHint.${strategy}`)}
          </p>
        </div>
      )}
    </TransferShell>
  );
}
