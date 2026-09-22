import { XMarkIcon } from '@heroicons/react/24/outline';
import clawdSvg from '../../../assets/clawd.svg';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import { ChecklistRow } from './ChecklistRow';
import { StepStatus, type ChecklistStep } from './types';

interface Props {
  steps: ChecklistStep[];
  onDismiss: () => void;
}

/**
 * The card a new install opens on: what has to be in place before the chat can
 * do its job, and how far along it is.
 *
 * Clawd heads the card rather than a generic glyph. The same character walks
 * the empty state this card replaces, so the card reads as that screen
 * continuing rather than as a notice dropped on top of it.
 *
 * Only ONE step is pointed at — the first unfinished required one. A list where
 * everything is emphasised says nothing about what to do next, and answering
 * that is the whole reason this is a checklist rather than a paragraph.
 *
 * Optional steps are never the one pointed at. They are worth doing and not
 * worth blocking on, and promoting one to "next" while a required step is still
 * open would say the opposite.
 */
export function OnboardingChecklist(props: Props) {
  const { steps, onDismiss } = props;
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
        <Tooltip content={t('onboarding.dismiss')}>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('onboarding.dismiss')}
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
    </div>
  );
}
