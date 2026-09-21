import { CheckIcon, ArrowPathIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { StepAction, StepStatus, type ChecklistStep } from './types';

interface Props {
  step: ChecklistStep;
  /** The one step being pointed at — the first unfinished required one. */
  isNext: boolean;
}

/**
 * One line of the onboarding checklist.
 *
 * Drawn after the Claude Code extension's own "Learn Claude Code" card, down to
 * the brand orange on the boxes and the button: a user who has met the
 * checklist in the editor should meet the same object here.
 *
 * The button is revealed by hover AND by keyboard focus, not by hover alone. A
 * control that only exists under a pointer cannot be reached by anyone driving
 * the app from the keyboard, and `focus-within` is what a Tab into the row
 * lands on.
 */
export function ChecklistRow(props: Props) {
  const { step, isNext } = props;
  const { t } = useTranslation('chat');

  const done = step.status === StepStatus.DONE;
  const unknown = step.status === StepStatus.UNKNOWN;
  const checking = step.status === StepStatus.CHECKING;
  const label = t(`onboarding.steps.${step.id}.label`);

  return (
    <li className="group/row flex items-center gap-2.5 rounded px-2 py-[0.3125rem] transition-colors hover:bg-surface-hover focus-within:bg-surface-hover">
      <StatusBox status={step.status} checkingLabel={t('onboarding.checking')} />

      <span
        className={[
          'min-w-0 flex-1 truncate text-[0.8461rem] leading-snug',
          done
            ? 'text-text-tertiary line-through'
            : isNext
              ? 'font-semibold text-text-primary'
              : 'text-text-secondary',
        ].join(' ')}
        title={label}
      >
        {label}
        {step.optional && !done && (
          <span className="ml-1.5 text-[0.7307rem] font-normal text-text-tertiary">
            {t('onboarding.optional')}
          </span>
        )}
      </span>

      {/* An unresolved answer is the row's own news, so it is stated in the row
          rather than left to the box to imply. */}
      {unknown && (
        <span className="flex shrink-0 items-center gap-1 text-[0.7307rem] text-text-tertiary group-hover/row:hidden">
          <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
          {t('onboarding.unknown')}
        </span>
      )}

      {/* Nothing to offer while the answer is still coming: a button pressed
          now would act on a status about to be replaced. */}
      {step.action !== StepAction.MANUAL && !checking && (
        <button
          type="button"
          disabled={step.running}
          onClick={() => void step.run?.()}
          className={[
            'shrink-0 rounded-[0.1875rem] px-2 py-[0.0625rem] text-[0.7307rem] font-medium transition-colors',
            'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 focus:opacity-100',
            'disabled:cursor-not-allowed disabled:opacity-100',
            'bg-accent-claude text-white hover:bg-accent-claude-hover',
          ].join(' ')}
        >
          {step.running ? (
            <span className="flex items-center gap-1">
              <ArrowPathIcon className="h-3 w-3 animate-spin" />
              {t('onboarding.working')}
            </span>
          ) : step.action === StepAction.PERFORM ? (
            t('onboarding.perform')
          ) : (
            t('onboarding.reveal')
          )}
        </button>
      )}
    </li>
  );
}

/**
 * The box at the head of a row.
 *
 * The reference draws every box in the brand orange whether or not it is
 * ticked, which is what makes the list read as one object rather than as a
 * finished part and an unfinished part. Three states, not two: a dashed edge
 * marks an answer we asked for and did not get, which a lighter grey would
 * only have read as a dimmer "no".
 */
function StatusBox(props: { status: StepStatus; checkingLabel: string }) {
  const base =
    'flex h-[0.875rem] w-[0.875rem] shrink-0 items-center justify-center rounded-[0.1875rem] border';
  // A spinner in place of the box, not beside it: the box is the thing whose
  // value is unsettled, so the wait belongs where the answer will land.
  if (props.status === StepStatus.CHECKING) {
    return (
      <span
        className="flex h-[0.875rem] w-[0.875rem] shrink-0 items-center justify-center"
        role="status"
        aria-label={props.checkingLabel}
      >
        <ArrowPathIcon className="h-3 w-3 animate-spin text-accent-claude" />
      </span>
    );
  }
  if (props.status === StepStatus.DONE) {
    return (
      <span className={`${base} border-accent-claude bg-accent-claude`}>
        <CheckIcon className="h-2.5 w-2.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (props.status === StepStatus.UNKNOWN) {
    return <span className={`${base} border-dashed border-accent-claude`} />;
  }
  return <span className={`${base} border-accent-claude`} />;
}
