import { CheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
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
  const checking = step.status === StepStatus.CHECKING;
  const label = t(`onboarding.steps.${step.id}.label`);
  const hint = t(`onboarding.steps.${step.id}.hint`);

  return (
    <Tooltip
      // Below the row. Beside it gets cut off, because a non-interactive
      // tooltip renders in place rather than into <body> and a card this near
      // the window edge has no room to its right. Above it covers the card's
      // own title, and a panel whose heading disappears when you point at it
      // reads as broken; below, what it covers is the steps not read yet.
      placement="bottom"
      content={
        // `break-keep` to undo the shared tooltip's `break-all`. That setting
        // suits the file paths it usually holds and splits a sentence mid-word
        // ("without i / t"). `break-words` does not undo it, being a different
        // CSS property.
        <span className="block max-w-[18rem] break-keep">
          <span className="block font-semibold">{label}</span>
          <span className="mt-1 block text-text-secondary">{hint}</span>
        </span>
      }
    >
      <li className="group/row flex items-center gap-2.5 rounded px-2 py-[0.3125rem] transition-colors hover:bg-surface-hover focus-within:bg-surface-hover">
        <StatusBox
          status={step.status}
          checkingLabel={t('onboarding.checking')}
          unknownLabel={t('onboarding.unknown')}
        />

        {/* The tag travels WITH the label, inside a group that takes the free
            space, so it reads as part of the step name. Left to sit between the
            label and the buttons it drifted into the middle of the row, because
            the buttons hold their place while invisible and it was pushed up
            against them rather than following the text it belongs to. Only the
            label truncates, so a long name eats into its own text instead of
            swallowing the word that says this step is skippable. */}
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span
            className={[
              'truncate text-[0.8461rem] leading-snug',
              done
                ? 'text-text-tertiary line-through'
                : isNext
                  ? 'font-semibold text-text-primary'
                  : 'text-text-secondary',
            ].join(' ')}
          >
            {label}
          </span>
          {step.optional && !done && (
            <span className="shrink-0 text-[0.7307rem] text-text-tertiary">
              {t('onboarding.optional')}
            </span>
          )}
        </span>

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
        // Outlined rather than filled with a quieter surface. `surface-tooltip`
        // is the dark face a tooltip sits on, which on a light theme put a
        // black pill inside a white card; a border reads as secondary in both.
        quiet
          ? 'border border-border-default text-text-secondary hover:bg-surface-hover'
          : 'border border-transparent bg-accent-claude text-white hover:bg-accent-claude-hover',
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
function StatusBox(props: { status: StepStatus; checkingLabel: string; unknownLabel: string }) {
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
  // The dashed edge is the whole marking. An icon beside the label said the
  // same thing a second time and had to sit somewhere, which put a lone glyph
  // in the middle of the row; the tooltip carries the sentence instead.
  if (props.status === StepStatus.UNKNOWN) {
    return (
      <span
        className={`${base} border-dashed border-accent-claude`}
        role="status"
        aria-label={props.unknownLabel}
      />
    );
  }
  return <span className={`${base} border-accent-claude`} />;
}
