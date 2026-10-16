import { useState } from 'react';
import Tippy from '@tippyjs/react/headless';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { FollowUpBehavior, resolveFollowUpBehavior, type ComposerShortcutSettings } from '@/shared';
import { useTranslation } from '@/i18n';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';

/**
 * The chevron beside the send button: a shortcut to the "follow-up behavior"
 * setting, so switching between queueing and steering does not mean a trip to
 * Settings. It writes the setting itself (not a per-session copy), so this menu
 * and the Settings row can never disagree.
 *
 * Writes the project scope when the project already overrides the key —
 * otherwise a global write would change nothing the user can see.
 */
export function FollowUpMenu() {
  const { t } = useTranslation('chat');
  const { settings, overrides, updateSettingWithScope } = useSettings();
  const [open, setOpen] = useState(false);
  const current = resolveFollowUpBehavior(settings as ComposerShortcutSettings);

  // Focus stays on the trigger, so a handler on the menu would never see Escape; and the composer reads
  // an unhandled Escape as "stop the stream".
  useEscapeLayer(() => { setOpen(false); return true; }, open);

  const choose = (value: FollowUpBehavior) => {
    setOpen(false);
    const scope = overrides.includes(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR) ? 'project' : 'global';
    void updateSettingWithScope(SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR, value, scope);
  };

  const items = [
    { value: FollowUpBehavior.Queue, label: t('chatInput.followUpMenu.queue') },
    { value: FollowUpBehavior.Steer, label: t('chatInput.followUpMenu.steer') },
  ];

  return (
    <Tippy
      visible={open}
      onClickOutside={() => setOpen(false)}
      interactive
      placement="top-end"
      offset={[0, 6]}
      render={attrs => (
        <div {...attrs} role="menu" aria-label={t('chatInput.followUpMenu.label')}
          className="z-50 min-w-[190px] p-1 bg-surface-overlay border border-border-default rounded-xl shadow-lg">
          {items.map(item => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              aria-checked={item.value === current}
              onClick={() => choose(item.value)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-start text-sm font-normal text-text-primary hover:bg-surface-pressed whitespace-nowrap"
            >
              <CheckIcon className={`w-[15px] h-[15px] shrink-0 ${item.value === current ? '' : 'invisible'}`} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={t('chatInput.followUpMenu.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center w-[16px] h-[26px] rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
      >
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
    </Tippy>
  );
}
