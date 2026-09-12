import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { PromptCategory, SavedPrompt } from '@/types/prompt';

interface Props {
  /** The prompt being edited, or undefined when a new one is being written. */
  editing?: SavedPrompt;
  onSubmit: (name: string, content: string, categoryIds: string[]) => Promise<void>;
  /** Every category that exists, offered as toggles. Created in the sidebar. */
  categories?: PromptCategory[];
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
export function PromptForm({ editing, onSubmit, onCancel, onBusyChange, categories = [] }: Props) {
  const { t } = useTranslation('common');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PromptFormValues>({
    defaultValues: {
      name: editing?.name ?? '',
      content: editing?.content ?? '',
    },
  });

  /**
   * The categories this prompt is filed under, by id.
   *
   * Held outside the form because they are toggles, not a field: react-hook-form
   * earns its keep on typed input and validation, and there is neither here.
   */
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(editing?.categories ?? []),
  );

  const toggleCategory = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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
      await onSubmit(values.name, values.content, [...selected]);
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

        {/* A <div>, not a <label>: a button is a labelable element, so wrapping
            these in one would fold the field's caption into each toggle's
            accessible name, and there is no single control here to label. */}
        <div className="block">
          <span className="mb-1 block text-xs text-text-tertiary">
            {t('promptLibrary.categoryLabel')}
          </span>
          {/* Toggles over the categories that exist, rather than a text field:
              a prompt belongs to as many as the user says, and new categories
              are made in the sidebar, where they can also be renamed. Typing a
              name here would be a second way to create one, spelled slightly
              differently each time. */}
          {categories.length === 0 ? (
            <p className="text-xs text-text-tertiary">{t('promptLibrary.noCategories')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => {
                const isOn = selected.has(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => toggleCategory(category.id)}
                    className={`max-w-[12rem] truncate rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      isOn
                        ? 'border-accent-primary bg-accent-primary text-text-inverse'
                        : 'border-border-default text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
