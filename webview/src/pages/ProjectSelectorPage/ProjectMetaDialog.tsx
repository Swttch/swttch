import { useEffect, useRef, useState } from 'react';
import { Portal } from '@/components/Portal';
import { useTranslation } from '@/i18n';

interface Props {
  /** The project's real, unedited folder name — shown as context and as the
   * name field's placeholder, so an empty field visibly means "use this". */
  realName: string;
  initialName: string;
  initialDescription: string;
  onConfirm: (name: string, description: string) => void;
  onCancel: () => void;
}

/**
 * Sets a project's display alias and description — a GUI-only overlay (see
 * projectBadge.ts and ProjectRow's displayName prop): neither field is ever
 * written to the real folder or to ~/.claude/projects.
 *
 * Built the same way as RenameTabDialog rather than using the platform's own
 * rename affordance, for the same reason: this page also renders over a
 * tunnel, where no IDE popup exists at all.
 */
export function ProjectMetaDialog(props: Props) {
  const { realName, initialName, initialDescription, onConfirm, onCancel } = props;
  const { t } = useTranslation('projectSelector');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    nameRef.current?.select();

    const handleFocusIn = (e: FocusEvent) => {
      if (dialogRef.current && e.target instanceof Node && !dialogRef.current.contains(e.target)) {
        nameRef.current?.focus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  const commit = () => onConfirm(name.trim(), description.trim());

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border border-border-default bg-surface-raised p-6 shadow-2xl"
        >
          <div>
            <h2 className="text-md font-semibold text-text-primary">{t('editDialog.title')}</h2>
            <p className="mt-1 truncate text-xs text-text-tertiary">{realName}</p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {t('editDialog.nameLabel')}
            </span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              placeholder={realName}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
              }}
              className="w-full rounded-lg border border-border-default bg-surface-default px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
          </label>
          {/* Says what an empty field does, since "falls back to the real
              folder name" is not a thing anyone guesses from an empty box. */}
          <p className="-mt-3 text-xs text-text-tertiary">{t('editDialog.nameHint')}</p>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {t('editDialog.descriptionLabel')}
            </span>
            <textarea
              value={description}
              placeholder={t('editDialog.descriptionPlaceholder')}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border-default bg-surface-default px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-tooltip hover:text-text-primary"
              onClick={onCancel}
            >
              {t('editDialog.cancel')}
            </button>
            <button
              className="rounded-lg bg-accent-primary-hover px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-accent-primary"
              onClick={commit}
            >
              {t('editDialog.save')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
