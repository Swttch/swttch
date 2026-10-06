import Tippy from '@tippyjs/react/headless';
import { Tag } from '@/pages/ChatPage/ChatInput/Tag';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import {
  calculateAutoCompactRemainingPercent,
  calculateContextWindowPercent,
  formatTokenCount,
} from '@/utils/contextWindow';
import { useContextWindowProbe } from '@/hooks/useContextWindowProbe';
import { useTranslation } from '@/i18n';

interface Props {
  onClick?: () => void;
  disabled?: boolean;
}

const DONUT_RADIUS = 7;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/** A ring that fills clockwise from the top as `percent` (0-100) grows. */
function Donut({ percent }: { percent: number }) {
  return (
    // Sits in a slot one line tall (1lh), so the tag does not shrink to the ring's own height
    // when the number is hidden on narrow widths and stays as tall as the model tag.
    <span className="inline-flex items-center shrink-0 h-[1lh]">
      <svg className="w-[18px] h-[18px] -rotate-90" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r={DONUT_RADIUS} stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <circle
          cx="10"
          cy="10"
          r={DONUT_RADIUS}
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={DONUT_CIRCUMFERENCE}
          strokeDashoffset={DONUT_CIRCUMFERENCE * (1 - percent / 100)}
        />
      </svg>
    </span>
  );
}

const TOOLTIP_CLASS =
  'bg-surface-overlay border border-border-default rounded-md px-3 py-2 text-xs text-text-primary shadow-lg max-w-[260px]';

export function ContextWindowTag(props: Props) {
  const { onClick, disabled = false } = props;
  const { t } = useTranslation('chat');
  const { contextWindowUsage } = useChatStreamContext();
  useContextWindowProbe();

  const totalTokens = contextWindowUsage?.totalTokens ?? 0;
  const contextWindow = contextWindowUsage?.contextWindow ?? 0;
  const maxOutputTokens = contextWindowUsage?.maxOutputTokens ?? 0;

  // The CLI reports the window size only when a turn ends (a new session, or one just loaded).
  // Rather than draw a wrong share against a guessed size (200k and the like), show the state as
  // it is: 0% when no tokens are used, and the used token count in place of a percentage when
  // the session has history but its window is still unknown (#328).
  if (contextWindow <= 0) {
    return (
      <Tippy
        placement="top"
        render={(attrs) => (
          <div className={TOOLTIP_CLASS} {...attrs}>
            <p>{t('chatInput.contextWindow.pending', { used: formatTokenCount(totalTokens) })}</p>
          </div>
        )}
      >
        <div className="flex items-center max-xs:hidden">
          <Tag disabled className="!px-[3px]">
            <Donut percent={0} />
            <span className="max-sm:hidden pb-px">{totalTokens > 0 ? formatTokenCount(totalTokens) : '0%'}</span>
          </Tag>
        </div>
      </Tippy>
    );
  }

  // The tag shows a whole percent and the tooltip title one decimal, both cut off, never rounded.
  const percent = calculateContextWindowPercent(totalTokens, contextWindow, 0);
  const precisePercent = calculateContextWindowPercent(totalTokens, contextWindow, 1);
  const remainingUntilCompact = calculateAutoCompactRemainingPercent(totalTokens, contextWindow, maxOutputTokens);
  const isClickable = !disabled && percent >= 10;

  return (
    <Tippy
      placement="top"
      render={(attrs) => (
        <div className={TOOLTIP_CLASS} {...attrs}>
          <p className="text-[0.9231rem]">
            {t('chatInput.contextWindow.title', {
              used: formatTokenCount(totalTokens),
              total: formatTokenCount(contextWindow),
              percent: precisePercent.toFixed(1),
            })}
          </p>
          {maxOutputTokens > 0 && (
            <p className="text-text-secondary mt-1 text-[0.7692rem]">
              {t('chatInput.contextWindow.remaining', { percent: Math.max(remainingUntilCompact, 0) })}
            </p>
          )}
          {isClickable && (
            <p className="text-text-secondary mt-1 text-[0.7692rem]">{t('chatInput.contextWindow.clickToCompact')}</p>
          )}
        </div>
      )}
    >
      <div className="flex items-center max-xs:hidden">
        <Tag onClick={isClickable ? onClick : undefined} disabled={!isClickable} className="!px-[3px]">
          <Donut percent={percent} />
          <span className="max-sm:hidden pb-px">{percent}%</span>
        </Tag>
      </div>
    </Tippy>
  );
}
