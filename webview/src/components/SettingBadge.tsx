import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Tooltip } from './Tooltip';
import { useTranslation } from '@/i18n';

/**
 * A small labelled badge shown next to a setting's title, with a Tippy tooltip
 * explaining it. Variant-driven so more badges can be added by just extending
 * {@link SettingBadgeVariant} and {@link BADGE_CONFIG}.
 *
 * The badge glyph and the tooltip text are BOTH i18n (badges.* keys). A
 * ClaudeNative badge may take a `docHref` — the tooltip then shows a link icon
 * that opens the official settings docs for that key in a new tab. The tooltip
 * is interactive in that case so the pointer can move onto the link.
 */
export enum SettingBadgeVariant {
  /** Sponsor-only feature. */
  Sponsor = 'sponsor',
  /** Maps to a Claude Code native settings.json key. */
  ClaudeNative = 'claudeNative',
}

interface BadgeConfig {
  /** i18n key (settings namespace) for the short glyph shown in the chip. */
  labelKey: string;
  /** i18n key (settings namespace) for the tooltip text. */
  tooltipKey: string;
  /** Tailwind colour classes for the chip. */
  className: string;
}

const BADGE_CONFIG: Record<SettingBadgeVariant, BadgeConfig> = {
  [SettingBadgeVariant.Sponsor]: {
    labelKey: 'badges.sponsorLabel',
    tooltipKey: 'badges.sponsor',
    className: 'bg-state-info-bg text-state-info-fg',
  },
  [SettingBadgeVariant.ClaudeNative]: {
    labelKey: 'badges.claudeNativeLabel',
    tooltipKey: 'badges.claudeNative',
    className: 'bg-accent-claude/20 text-accent-claude',
  },
};

interface Props {
  variant: SettingBadgeVariant;
  /** ClaudeNative only: official docs URL for this setting key (opens in _blank). */
  docHref?: string;
}

export function SettingBadge(props: Props) {
  const { variant, docHref } = props;
  const { t } = useTranslation('settings');
  const config = BADGE_CONFIG[variant];

  const hasLink = variant === SettingBadgeVariant.ClaudeNative && !!docHref;
  const content = hasLink ? (
    <span className="inline-flex items-center gap-1.5">
      {t(config.tooltipKey)}
      <a
        href={docHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex text-accent-claude transition-opacity hover:opacity-80"
        aria-label={t('badges.openDocs')}
      >
        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
      </a>
    </span>
  ) : (
    t(config.tooltipKey)
  );

  return (
    <Tooltip content={content} interactive={hasLink}>
      <span
        className={`inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded px-1 text-[0.65rem] font-semibold leading-none ${config.className}`}
      >
        {t(config.labelKey)}
      </span>
    </Tooltip>
  );
}
