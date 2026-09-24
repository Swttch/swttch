import { XMarkIcon } from '@heroicons/react/24/outline';
import clawdSvg from '../../../assets/clawd.svg';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import { ChecklistRow } from './ChecklistRow';
import { StepStatus, type ChecklistStep } from './types';

interface Props {
  steps: ChecklistStep[];
  /** Every step is done, so "Get started" is available. */
  allDone: boolean;
  /** Record that the card was closed. Both buttons call this. */
  onDismiss: () => void;
}

/**
 * The card a new install opens on: what is worth having in place before the chat
 * can do its job, and how far along it is.
 *
 * It is raised once per install and closed by hand, by either button. Nothing
 * here closes itself: finishing the last step lights "Get started" up rather
 * than dismissing the card out from under the person reading it.
 *
 * Clawd heads the card rather than a generic glyph. The same character walks
 * the empty state beside it, so the card reads as that screen continuing rather
 * than as a notice dropped on top of it.
 *
 * Only ONE step is pointed at — the first unfinished required one. A list where
 * everything is emphasised says nothing about what to do next, and answering
 * that is the whole reason this is a checklist rather than a paragraph.
 *
 * Optional steps are never the one pointed at. They are worth doing and not
 * worth putting ahead of a required step that is still open.
 */
export function OnboardingChecklist(props: Props) {
  const { steps, allDone, onDismiss } = props;
  const { t } = useTranslation('chat');

  if (steps.length === 0) return null;

  // A step still being checked is not put forward as the thing to do next: it
  // may be finished already, and the answer is seconds away.
  const nextId = steps.find(
    (s) => !s.optional && s.status !== StepStatus.DONE && s.status !== StepStatus.CHECKING,
  )?.id;

  return (
    <div className="w-full rounded-lg border border-border-default bg-surface-raised p-3 text-left">
      <div className="flex items-center gap-2 px-2">
        <img src={clawdSvg} alt="" aria-hidden className="h-[1.125rem] w-[1.125rem] shrink-0" />
        <h3 className="min-w-0 flex-1 truncate text-[0.8461rem] font-semibold text-text-primary">
          {t('onboarding.title')}
        </h3>
        <Tooltip content={t('onboarding.close')}>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('onboarding.close')}
            className="-mr-1 shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>

      <ul className="mt-3 flex flex-col">
        {steps.map((step) => (
          <ChecklistRow key={step.id} step={step} isNext={step.id === nextId} />
        ))}
      </ul>

      {/* Wrapped in a span because a disabled button receives no pointer events,
          so Tippy attached to the button itself would never hear a hover — and
          the disabled state is exactly when this tooltip has something to say.
          The tooltip is dropped once the button works: a control that does what
          it says needs no note explaining the way around it. */}
      <Tooltip content={allDone ? undefined : t('onboarding.getStartedHint')}>
        <span className="mt-3 block px-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={!allDone}
            className="w-full rounded-md bg-accent-primary px-3 py-1.5 text-[0.8076rem] font-medium text-accent-primary-fg transition-colors hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-tertiary disabled:hover:bg-surface-sunken"
          >
            {t('onboarding.getStarted')}
          </button>
        </span>
      </Tooltip>
    </div>
  );
}
