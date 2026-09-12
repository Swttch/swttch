import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from '@/i18n';
import { fillPromptVariables } from '@/utils/promptVariables';

interface Props {
  /** The saved prompt's text, still holding its `{{...}}` placeholders. */
  content: string;
  /** The names to ask for, de-duplicated and in first-appearance order. */
  names: string[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

/**
 * The answers, held by position rather than by name.
 *
 * A variable may be named anything that is not a brace, including a dot or a
 * bracket, and react-hook-form reads those as a path into nested state. Indexing
 * keeps every name, however it is written, a single flat field.
 */
interface VariablesForm {
  answers: { value: string }[];
}

/**
 * Asks for the values of a prompt's `{{...}}` placeholders before it is inserted.
 *
 * A blank answer is allowed and substitutes an empty string: a prompt may well
 * read better with a part left out, and forcing a value would make the user
 * type a space to get past this.
 */
export function PromptVariablesModal({ content, names, onSubmit, onCancel }: Props) {
  const { t } = useTranslation('common');
  const submitRef = useRef<HTMLButtonElement>(null);

  const { register, watch, getValues } = useForm<VariablesForm>({
    defaultValues: { answers: names.map(() => ({ value: '' })) },
  });

  // The form's own ref is kept and a second one taken alongside it, so moving
  // the caret between fields is a plain focus() on a node we hold rather than a
  // name lookup through the form.
  const fieldRefs = useRef<Array<HTMLInputElement | null>>([]);
  const registerField = (index: number) => {
    const { ref, ...rest } = register(`answers.${index}.value` as const);
    return {
      ...rest,
      ref: (element: HTMLInputElement | null) => {
        ref(element);
        fieldRefs.current[index] = element;
      },
    };
  };

  // Watched rather than read on demand: the preview has to follow every
  // keystroke, so this component re-renders with the form either way.
  const answers = watch('answers');
  const valuesByName = (source: VariablesForm['answers']): Record<string, string> =>
    Object.fromEntries(names.map((name, index) => [name, source[index]?.value ?? '']));

  const preview = fillPromptVariables(content, valuesByName(answers));

  /**
   * Move on from the field at [index] to the next one still waiting for a value,
   * wrapping around so a field skipped earlier is not left behind. Once every
   * field has an answer there is nothing left to fill, so focus lands on Insert
   * rather than on Cancel, and Shift+Tab from there still reaches Cancel.
   */
  const advanceFrom = (index: number) => {
    const current = getValues('answers');
    for (let step = 1; step <= names.length; step++) {
      const next = (index + step) % names.length;
      if ((current[next]?.value ?? '') === '') {
        fieldRefs.current[next]?.focus();
        return;
      }
    }
    submitRef.current?.focus();
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  const handleFieldKeyDown = (e: React.KeyboardEvent, index: number) => {
    // Enter walks the fields rather than submitting, so the last thing a user
    // confirms is always the Insert button they can see.
    //
    // Auto-repeat is dropped: this dialog is opened by an Enter press on the
    // panel behind it, and a still-held key would otherwise walk past the first
    // field before it was read. The repeat flag is used rather than waiting for
    // a keyup, because a dialog opened with the mouse never sees one and its
    // first Enter would be dead.
    if (e.key === 'Enter' && !e.shiftKey && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      advanceFrom(index);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* Focus belongs in the first field, not on this container: the user is
          here to type. Escape still reaches this handler by bubbling out of the
          field it was pressed in. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('promptLibrary.variables.title')}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="flex max-h-[80vh] w-[min(32rem,90vw)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-xl focus:outline-none"
      >
        <div className="flex-shrink-0 px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('promptLibrary.variables.title')}
          </h2>
          <p className="mt-1 text-xs text-text-tertiary">
            {t('promptLibrary.variables.description')}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2">
          {names.map((name, index) => (
            <label key={name} className="block">
              <span className="mb-1 block text-xs text-text-tertiary">{name}</span>
              <input
                {...registerField(index)}
                autoFocus={index === 0}
                onKeyDown={(e) => handleFieldKeyDown(e, index)}
                className="w-full rounded-md border border-border-default bg-surface-base px-2 py-1.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
              />
            </label>
          ))}

          {/* Recessed and unbordered, so it does not read as one more field to
              fill in. It shows exactly what Insert will put in the composer. */}
          <div>
            <span className="mb-1 block text-xs text-text-tertiary">
              {t('promptLibrary.variables.preview')}
            </span>
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-sunken px-3 py-2 text-sm leading-relaxed text-text-secondary">
              {preview}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            {t('promptLibrary.cancel')}
          </button>
          <button
            ref={submitRef}
            type="button"
            onClick={() => onSubmit(valuesByName(getValues('answers')))}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm text-text-inverse transition-opacity hover:opacity-90"
          >
            {t('promptLibrary.variables.insert')}
          </button>
        </div>
      </div>
    </div>
  );
}
