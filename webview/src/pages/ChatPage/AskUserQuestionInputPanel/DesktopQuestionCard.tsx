import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import type { useFormState } from './useFormState';

type Form = ReturnType<typeof useFormState>;

interface Props {
  form: Form;
  /** How many questions there are; with more than one the heading has "1 of 3" and arrows. */
  total: number;
  onSubmit: () => void;
  onCancel: () => void;
  onOtherKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

const OTHER = 'Other';

/**
 * A question for the person, drawn as the desktop app draws it in the views that follow it (#673): a heading band with
 * the question (and "1 of 3" with arrows when there are several), one row for each option with a radio, its name and
 * what it means, a last row for their own answer that opens a field when picked, and "Skip" and "Submit" ("Next"
 * until the last question) under it. Measured on the desktop app's recording; sizes are in rem, so they follow the
 * Font size setting.
 */
export function DesktopQuestionCard({ form, total, onSubmit, onCancel, onOtherKeyDown }: Props) {
  const { t } = useTranslation('chat');
  const otherRef = useRef<HTMLTextAreaElement>(null);
  const selected = form.currentField?.selected ?? [];
  const multi = form.currentQuestion.multiSelect;
  const otherSelected = form.isOtherSelected(form.currentIndex);

  useEffect(() => {
    if (otherSelected) setTimeout(() => otherRef.current?.focus(), 0);
  }, [otherSelected, form.currentIndex]);

  const options = form.allOptionsFor(form.currentIndex);
  return (
    <div className="w-full shrink-0 animate-[fadeIn_0.3s_ease-out] px-4 pb-2 pt-[0.375rem]" data-testid="desktop-question-card">
      <div className="flex w-full max-w-[33.4rem] flex-col overflow-hidden rounded-[0.8125rem] border border-text-primary/[0.05]">
        <div className="flex h-[2.99rem] shrink-0 items-center justify-between bg-text-primary/[0.04] px-[1.2188rem] text-[0.9rem] text-text-primary">
          <span className="min-w-0 truncate">{form.currentQuestion.question}</span>
          {total > 1 && (
            <span className="flex shrink-0 items-center gap-[0.9rem] ps-3 text-[0.8461rem] text-text-secondary">
              <button
                type="button"
                aria-label="previous"
                disabled={form.currentIndex === 0}
                onClick={() => form.setCurrentIndex(form.currentIndex - 1)}
                className="rounded p-0.5 transition-colors hover:text-text-primary disabled:opacity-40 disabled:hover:text-text-secondary"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span>{t('askUserQuestion.card.progress', { current: form.currentIndex + 1, total })}</span>
              <button
                type="button"
                aria-label="next"
                disabled={form.isLastTab}
                onClick={() => form.setCurrentIndex(form.currentIndex + 1)}
                className="rounded p-0.5 transition-colors hover:text-text-primary disabled:opacity-40 disabled:hover:text-text-secondary"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </span>
          )}
        </div>

        <div role={multi ? 'group' : 'radiogroup'} className="flex flex-col">
          {options.map((option) => {
            const isOther = option.label === OTHER;
            const checked = selected.includes(option.label);
            return (
              <button
                key={option.label}
                type="button"
                role={multi ? 'checkbox' : 'radio'}
                aria-checked={checked}
                data-testid={isOther ? 'question-option-other' : 'question-option'}
                onClick={() => form.selectOption(form.currentIndex, option.label, multi)}
                className="flex w-full items-start border-t border-text-primary/[0.06] px-[1.1rem] pb-[1.2rem] pt-[1.1rem] text-start transition-colors first:border-t-0 hover:bg-text-primary/[0.03]"
              >
                <span
                  className={`mt-[0.0625rem] flex h-[1.39rem] w-[1.39rem] shrink-0 items-center justify-center border ${multi ? 'rounded-[0.35rem]' : 'rounded-full'} ${
                    checked ? 'border-[rgb(52,120,214)] bg-[rgb(52,120,214)]' : 'border-text-primary/[0.3]'
                  }`}
                >
                  {checked && <span className={`h-[0.5rem] w-[0.5rem] bg-white ${multi ? 'rounded-[0.1rem]' : 'rounded-full'}`} />}
                </span>
                <span className="ms-[1.1rem] flex min-w-0 flex-1 flex-col">
                  <span className="text-[0.9rem] leading-[1.25rem] text-text-primary">{isOther ? t('askUserQuestion.other') : option.label}</span>
                  {!isOther && option.description && (
                    <span className="mt-[0.6rem] text-[0.9rem] leading-[1.25rem] text-text-secondary">{option.description}</span>
                  )}
                  {isOther && checked && (
                    <textarea
                      ref={otherRef}
                      rows={1}
                      value={form.currentField?.otherText ?? ''}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => form.setOtherText(form.currentIndex, event.target.value)}
                      onKeyDown={onOtherKeyDown}
                      placeholder={t('askUserQuestion.card.placeholder')}
                      className="mt-[0.7rem] block min-h-[2.64rem] w-full resize-none rounded-[0.5rem] border border-[rgb(52,120,214)] bg-text-primary/[0.03] px-[0.9rem] py-[0.55rem] text-[0.9rem] leading-[1.25rem] text-text-primary placeholder:text-text-secondary focus:outline-none"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-[0.75rem] px-[1.0625rem] pb-[1.125rem] pt-[0.7rem]">
          <button
            type="button"
            data-testid="question-skip"
            onClick={onCancel}
            className="h-[1.9062rem] rounded-[0.5625rem] bg-text-primary/[0.12] px-[0.5625rem] text-[1rem] text-text-primary transition-opacity hover:opacity-80"
          >
            {t('askUserQuestion.card.skip')}
          </button>
          <button
            type="button"
            data-testid="question-submit"
            disabled={!form.canSubmitCurrent}
            onClick={onSubmit}
            className="h-[1.9062rem] rounded-[0.5625rem] bg-text-primary/[0.92] px-[0.5625rem] text-[1rem] text-text-inverse transition-colors hover:bg-text-primary disabled:opacity-50"
          >
            {form.isLastTab ? t('askUserQuestion.card.submit') : t('askUserQuestion.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
