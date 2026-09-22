import { CheckIcon, ArrowPathIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import { ActionKind, StepStatus, type ChecklistStep, type StepAction } from './types';

interface Props {
  step: ChecklistStep;
  /** The one step being pointed at — the first unfinished required one. */
  isNext: boolean;
}

/** Which label each button carries. Fixed by kind, never chosen by the row. */
const ACTION_LABEL: Record<ActionKind, string> = {
  [ActionKind.PERFORM]: 'onboarding.perform',
  [ActionKind.RECHECK]: 'onboarding.recheck',
  [ActionKind.LOGIN]: 'onboarding.login',
  [ActionKind.REVEAL]: 'onboarding.reveal',
};

/**
 * One line of the onboarding checklist.
 *
 * Drawn after the Claude Code extension's own "Learn Claude Code" card, down to
 * the brand orange on the boxes and the buttons: a user who has met the
 * checklist in the editor should meet the same object here.
 *
 * Buttons are revealed by hover AND by keyboard focus, not by hover alone. A
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
  const hint = t(`onboarding.steps.${step.id}.hint`);

  return (
    <Tooltip
      // Above, not beside. A non-interactive tooltip renders in place rather
      // than into <body>, so one hung off the side of a card this near the
      // window edge is cut off instead of flipped.
      placement="top"
      content={
        // `break-normal`, not `break-words`, to undo the shared tooltip's
        // `break-all`. That setting suits the file paths it usually holds and
        // splits a sentence mid-word ("without i / t"); the two are different
        // CSS properties, so overriding the wrong one leaves it in place.
        <span className="block max-w-[18rem] break-normal">
          <span className="block font-semibold">{label}</span>
          <span className="mt-1 block text-text-secondary">{hint}</span>
        </span>
      }
    >
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
        >
          {label}
        </span>

        {/* Outside the truncating label, so a long step name eats into its own
            text rather than swallowing the word that says this one is skippable. */}
        {step.optional && !done && (
          <span className="shrink-0 text-[0.7307rem] text-text-tertiary">
            {t('onboarding.optional')}
          </span>
        )}

        {/* An unresolved answer is marked, not spelled out. The dashed box
            carries it and the row's tooltip says the rest — a note beside the
            label competed for the same line and truncated the step name itself,
            which is the one thing on the row that has to stay readable. */}
        {unknown && (
          <QuestionMarkCircleIcon
            className="h-3.5 w-3.5 shrink-0 text-text-tertiary"
            aria-label={t('onboarding.unknown')}
          />
        )}

        {/* Nothing to offer while the answer is still coming: a button pressed
            now would act on a status about to be replaced. */}
        {!checking && (
          <span className="flex shrink-0 items-center gap-1">
            {step.actions.map((action) => (
              <ActionButton key={action.kind} action={action} />
            ))}
          </span>
        )}
      </li>
    </Tooltip>
  );
}

function ActionButton(props: { action: StepAction }) {
  const { action } = props;
  const { t } = useTranslation('chat');

  // Asking again is never the thing the row is asking for, so it stays quiet
  // next to the button that is. Where it is the only button, the bold step name
  // is already carrying that weight.
  const quiet = action.kind === ActionKind.RECHECK;

  return (
    <button
      type="button"
      disabled={action.running}
      onClick={() => void action.run()}
      className={[
        'rounded-[0.1875rem] px-2 py-[0.0625rem] text-[0.7307rem] font-medium transition-colors',
        'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 focus:opacity-100',
        'disabled:cursor-not-allowed disabled:opacity-100',
        quiet
          ? 'bg-surface-tooltip text-text-secondary hover:bg-surface-hover'
          : 'bg-accent-claude text-white hover:bg-accent-claude-hover',
      ].join(' ')}
    >
      {action.running ? (
        <span className="flex items-center gap-1">
          <ArrowPathIcon className="h-3 w-3 animate-spin" />
          {t('onboarding.working')}
        </span>
      ) : (
        t(ACTION_LABEL[action.kind])
      )}
    </button>
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
