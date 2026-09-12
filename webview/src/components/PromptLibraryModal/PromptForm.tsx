import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { PromptScope, SavedPrompt } from '@/types/prompt';

interface Props {
  /** The prompt being edited, or undefined when a new one is being written. */
  editing?: SavedPrompt;
  /** Where a new prompt will be saved. Ignored while editing. */
  scope: PromptScope;
  /**
   * Called when the user picks a different scope for a new prompt. Absent while
   * editing, which is what makes the picker read-only there.
   */
  onScopeChange?: (scope: PromptScope) => void;
  /** False when no project is open, so 'project' cannot be chosen. */
  projectAvailable: boolean;
  onSubmit: (name: string, content: string) => Promise<void>;
  onCancel: () => void;
  /** Reported while a save is in flight, so the modal can lock itself. */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * The `{{...}}` example shown in the content placeholder.
 *
 * It is handed to t() as a value rather than written into each translation:
 * i18next reads `{{...}}` as an interpolation, so a literal one in the string
 * would be substituted away before anyone saw it.
 */
const VARIABLE_EXAMPLE = '{{name}}';

interface PromptFormValues {
  name: string;
  content: string;
}

/** The create/edit screen for one saved prompt, shown in place of the list. */
export function PromptForm({
  editing,
  scope,
  onScopeChange,
  projectAvailable,
  onSubmit,
  onCancel,
  onBusyChange,
}: Props) {
  const { t } = useTranslation('common');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PromptFormValues>({
    defaultValues: { name: editing?.name ?? '', content: editing?.content ?? '' },
  });

  /**
   * A failed save, which is not a problem with any one field. Field problems
   * live in the form's own errors; this is the backend saying no.
   */
  const [saveError, setSaveError] = useState<string | null>(null);

  const submit = handleSubmit(async (values) => {
    setSaveError(null);
    onBusyChange?.(true);
    try {
      await onSubmit(values.name, values.content);
    } catch {
      setSaveError(t('promptLibrary.saveFailed'));
    } finally {
      onBusyChange?.(false);
    }
  });

  // A field's own message wins: it names what to fix, where a save failure only
  // says the attempt did not land.
  const error = errors.name?.message ?? errors.content?.message ?? saveError;

  // Project scope is offered only when a project is open, because a prompt has
  // nowhere to be written without one.
  const scopeOptions: Array<{ value: PromptScope; label: string }> = [
    { value: 'global', label: t('promptLibrary.scopeGlobal') },
    ...(projectAvailable
      ? [{ value: 'project' as PromptScope, label: t('promptLibrary.scopeProject') }]
      : []),
  ];

  // A segmented control rather than a dropdown, matching ProjectSortToggle:
  // both choices are visible and one click switches, with no menu to open first.
  const scopeOptionClass = (isActive: boolean) =>
    `rounded px-3 py-1 text-sm transition-colors ${
      isActive
        ? 'bg-surface-hover text-text-primary'
        : 'text-text-tertiary hover:text-text-secondary'
    }`;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="w-8 h-8 flex items-center justify-center rounded text-text-tertiary hover:bg-surface-hover"
          title={t('promptLibrary.cancel')}
          aria-label={t('promptLibrary.cancel')}
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-text-primary">
          {editing ? t('promptLibrary.editTitle') : t('promptLibrary.createTitle')}
        </h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-3">
        {/* Only while creating. Moving a saved prompt between scopes is a
            delete-and-recreate across two files, not an edit of one, so the
            picker stays out of the edit screen rather than implying otherwise. */}
        {!editing && (
          <div>
            <span className="block text-xs text-text-tertiary mb-1">
              {t('promptLibrary.scopeFieldLabel')}
            </span>
            <div
              role="group"
              aria-label={t('promptLibrary.scopeFieldLabel')}
              className="inline-flex items-center gap-0.5 rounded border border-border-default p-0.5"
            >
              {scopeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={scope === option.value}
                  onClick={() => onScopeChange?.(option.value)}
                  className={scopeOptionClass(scope === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <span className="block text-xs text-text-tertiary mb-1">{t('promptLibrary.nameLabel')}</span>
          <input
            autoFocus
            {...register('name', {
              // Trimmed, so a name of only spaces is refused the same way an
              // empty one is.
              validate: (value) =>
                value.trim() !== '' || t('promptLibrary.nameRequired'),
            })}
            aria-invalid={errors.name ? true : undefined}
            placeholder={t('promptLibrary.namePlaceholder')}
            className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-base border border-border-default text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-border-focus"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-text-tertiary mb-1">{t('promptLibrary.contentLabel')}</span>
          <textarea
            {...register('content', {
              validate: (value) =>
                value.trim() !== '' || t('promptLibrary.contentRequired'),
            })}
            aria-invalid={errors.content ? true : undefined}
            placeholder={t('promptLibrary.contentPlaceholder', { sample: VARIABLE_EXAMPLE })}
            rows={8}
            className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-base border border-border-default text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-border-focus resize-y"
          />
        </label>

        {error && <p className="text-xs text-state-error-fg">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3 flex-shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover"
        >
          {t('promptLibrary.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSubmitting}
          className="px-3 py-1.5 text-sm rounded-md bg-accent-primary text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t('promptLibrary.save')}
        </button>
      </div>
    </div>
  );
}
