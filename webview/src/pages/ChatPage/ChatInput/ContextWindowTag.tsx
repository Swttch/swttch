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
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, ContextBadgeDisplay } from '@/types/settings';

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

const DISPLAY_CHOICES: { value: ContextBadgeDisplay; labelKey: string }[] = [
  { value: ContextBadgeDisplay.PERCENT, labelKey: 'chatInput.contextWindow.displayPercent' },
  { value: ContextBadgeDisplay.TOKENS, labelKey: 'chatInput.contextWindow.displayTokens' },
  { value: ContextBadgeDisplay.NONE, labelKey: 'chatInput.contextWindow.displayNone' },
];

/**
 * The tooltip's own switch for what the badge writes next to its ring, the same
 * setting the settings page edits (#328). Kept apart from the compact line by a
 * rule and a margin so a press meant for "click to compact" cannot land on it.
 */
function DisplayChoice({ current, onChange }: { current: ContextBadgeDisplay; onChange: (v: ContextBadgeDisplay) => void }) {
  const { t } = useTranslation('chat');
  return (
    <div className="mt-2 pt-2 border-t border-border-default flex items-center justify-between gap-3">
      <span className="text-text-secondary text-[0.7692rem] shrink-0">{t('chatInput.contextWindow.displayLabel')}</span>
      <div role="radiogroup" aria-label={t('chatInput.contextWindow.displayLabel')} className="flex gap-0.5 ml-auto">
        {DISPLAY_CHOICES.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={current === value}
            onClick={() => onChange(value)}
            className={`px-1.5 py-[1px] rounded text-[0.7692rem] transition-colors ${
              current === value ? 'bg-surface-hover text-text-primary' : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ContextWindowTag(props: Props) {
  const { onClick, disabled = false } = props;
  const { t } = useTranslation('chat');
  const { contextWindowUsage } = useChatStreamContext();
  useContextWindowProbe();
  const { settings, updateSetting } = useSettings();
  const display = settings[SettingKey.CONTEXT_BADGE_DISPLAY] ?? ContextBadgeDisplay.PERCENT;
  const choice = (
    <DisplayChoice current={display} onChange={(next) => void updateSetting(SettingKey.CONTEXT_BADGE_DISPLAY, next)} />
  );

  const totalTokens = contextWindowUsage?.totalTokens ?? 0;
  const contextWindow = contextWindowUsage?.contextWindow ?? 0;
  const maxOutputTokens = contextWindowUsage?.maxOutputTokens ?? 0;

  // The CLI reports the window size only when a turn ends (a new session, or one just loaded).
  // Rather than draw a wrong share against a guessed size (200k and the like), show the state as
  // it is: 0% when no tokens are used, and the used token count in place of a percentage when
  // the session has history but its window is still unknown (#328).
  if (contextWindow <= 0) {
    // A share cannot be written without the window, so the percent choice leaves the ring alone
    // (0% when nothing is used yet, which needs no window to be true) rather than guess one.
    const pendingText =
      display === ContextBadgeDisplay.TOKENS
        ? formatTokenCount(totalTokens)
        : display === ContextBadgeDisplay.PERCENT && totalTokens === 0
          ? '0%'
          : '';
    return (
      <Tippy
        placement="top"
        interactive
        interactiveBorder={8}
        delay={[0, 100]}
        appendTo={() => document.body}
        render={(attrs) => (
          <div className={TOOLTIP_CLASS} {...attrs}>
            <p>{t('chatInput.contextWindow.pending', { used: formatTokenCount(totalTokens) })}</p>
            {choice}
          </div>
        )}
      >
        <div className="flex items-center max-xs:hidden">
          <Tag disabled className="!px-[3px]">
            <Donut percent={0} />
            {pendingText && <span className="max-sm:hidden pb-px">{pendingText}</span>}
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

  const badgeText =
    display === ContextBadgeDisplay.PERCENT
      ? `${percent}%`
      : display === ContextBadgeDisplay.TOKENS
        ? formatTokenCount(totalTokens)
        : '';

  return (
    <Tippy
      placement="top"
      interactive
      interactiveBorder={8}
      delay={[0, 100]}
      appendTo={() => document.body}
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
          {choice}
        </div>
      )}
    >
      <div className="flex items-center max-xs:hidden">
        <Tag onClick={isClickable ? onClick : undefined} disabled={!isClickable} className="!px-[3px]">
          <Donut percent={percent} />
          {badgeText && <span className="max-sm:hidden pb-px">{badgeText}</span>}
        </Tag>
      </div>
    </Tippy>
  );
}
