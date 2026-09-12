import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { SavedPrompt } from '@/types/prompt';

interface Props {
  /** The prompt being edited, or undefined when a new one is being written. */
  editing?: SavedPrompt;
  onSubmit: (name: string, content: string, category: string) => Promise<void>;
  /** The categories already in use in this scope, offered while typing. */
  knownCategories?: string[];
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
  category: string;
}

/** The create/edit screen for one saved prompt, shown in place of the list. */
export function PromptForm({ editing, onSubmit, onCancel, onBusyChange, knownCategories = [] }: Props) {
  const { t } = useTranslation('common');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PromptFormValues>({
    defaultValues: {
      name: editing?.name ?? '',
      content: editing?.content ?? '',
      category: editing?.category ?? '',
    },
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
      await onSubmit(values.name, values.content, values.category);
    } catch {
      setSaveError(t('promptLibrary.saveFailed'));
    } finally {
      onBusyChange?.(false);
    }
  });

  // A field's own message wins: it names what to fix, where a save failure only
  // says the attempt did not land.
  const error = errors.name?.message ?? errors.content?.message ?? saveError;

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
          <span className="mb-1 block text-xs text-text-tertiary">
            {t('promptLibrary.categoryLabel')}
          </span>
          {/* A datalist rather than a picker: the category is free text, and the
              list only offers what is already in use so near-duplicates like
              "Debug" and "debugging" are less likely. */}
          <input
            {...register('category')}
            list="prompt-category-suggestions"
            placeholder={t('promptLibrary.categoryPlaceholder')}
            className="w-full rounded-md border border-border-default bg-surface-base px-2 py-1.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
          />
          <datalist id="prompt-category-suggestions">
            {knownCategories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
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
