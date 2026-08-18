import { PlayIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/solid';
import type { ComponentType, SVGProps } from 'react';
import { useTranslation } from '@/i18n';
import { getTextContent, type LoadedMessageDto } from '../../../types';
import { ToolWrapper } from './ToolRenderers/common';
import { useAutoResume, type AutoResumeAction } from '@/hooks/useAutoResume';

interface Props {
  message: LoadedMessageDto;
}

/**
 * Renders a usage-limit assistant message with the auto-resume action inline,
 * right after the sentence. It reuses {@link ToolWrapper} — the same wrapper
 * every assistant line uses — so the bullet marker and left/right spacing match
 * the rest of the conversation. The text and button live in ONE inline flow
 * inside the wrapper's content column, so the button hugs the end of the
 * sentence and, when the text wraps (mobile), it follows to the last line's end
 * instead of dropping to a separate row.
 *
 * The limit notice is plain text (no markdown structure), so it is rendered as
 * inline text rather than through the markdown pipeline — that is what lets the
 * button sit in the same inline flow.
 *
 * `useAutoResume` derives the ACTIVE limit from the session's messages; only the
 * matching message gets the live action/countdown. The action shows for everyone
 * — sponsorship is checked on click, not on render.
 */

const ACTION_LABEL_KEY: Record<AutoResumeAction, string> = {
  schedule: 'autoResume.schedule',
  cancel: 'autoResume.cancel',
  resumeNow: 'autoResume.resumeNow',
};

// All three actions render as backgroundless (ghost) buttons with an icon:
//   resume now → green + play, schedule → orange + clock, cancel → orange + x.
const ACTION_ICON: Record<AutoResumeAction, ComponentType<SVGProps<SVGSVGElement>>> = {
  resumeNow: PlayIcon,
  schedule: ClockIcon,
  cancel: XMarkIcon,
};

const ACTION_COLOR: Record<AutoResumeAction, string> = {
  resumeNow: 'text-state-success-fg hover:opacity-80',
  schedule: 'text-accent-claude hover:text-accent-claude-hover',
  // Neutral — same colour as a user message (UserMessageRenderer's text-text-primary/80).
  cancel: 'text-text-primary/80 hover:text-text-primary',
};

function ActionButton(props: { action: AutoResumeAction; onClick: () => void }) {
  const { action, onClick } = props;
  const { t } = useTranslation('chat');

  // The scheduled state reads as a status ("자동 재개 예정됨", clock, orange) and
  // only reveals the cancel affordance ("예약취소", x, neutral) on hover.
  if (action === 'cancel') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex items-center align-middle text-xs font-medium transition-colors"
      >
        <span className="inline-flex items-center gap-1 text-accent-claude group-hover:hidden">
          <ClockIcon className="h-3.5 w-3.5" />
          {t('autoResume.scheduled')}
        </span>
        <span className="hidden items-center gap-1 text-text-primary/80 group-hover:inline-flex">
          <XMarkIcon className="h-3.5 w-3.5" />
          {t('autoResume.cancel')}
        </span>
      </button>
    );
  }

  const Icon = ACTION_ICON[action];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 align-middle text-xs font-medium transition-colors ${ACTION_COLOR[action]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {t(ACTION_LABEL_KEY[action])}
    </button>
  );
}

export function LimitReachedRenderer(props: Props) {
  const { message } = props;
  const { t } = useTranslation('chat');
  const ar = useAutoResume();
  const text = getTextContent(message);

  const isActive = ar.limit?.messageUuid === message.uuid;
  // Shown for everyone; non-sponsors get the invite toast on click.
  const showAction = isActive && ar.action !== null;
  const onClick =
    ar.action === 'schedule' ? ar.schedule : ar.action === 'cancel' ? ar.cancel : ar.resumeNow;

  const statusText = isActive && ar.statusKey ? t(ar.statusKey) : null;
  const countdownText =
    isActive && ar.countdownSeconds !== null
      ? t('autoResume.countdown', { seconds: ar.countdownSeconds })
      : null;

  return (
    <ToolWrapper message={message} className="!mt-0">
      <span className="text-text-primary text-[1rem] leading-relaxed">
        <span>{text}</span>
        {(countdownText || statusText || showAction) && (
            <span className="mx-2 text-gray-500">&bull;</span>
        )}
        {countdownText && (
          <span className="ms-2 me-3 text-xs tabular-nums text-text-primary align-middle">{countdownText}</span>
        )}
        {statusText && (
          <span className="ms-2 me-3 text-xs text-text-tertiary align-middle">{statusText}</span>
        )}
        {showAction && ar.action && (
          <ActionButton action={ar.action} onClick={onClick} />
        )}
      </span>
    </ToolWrapper>
  );
}
