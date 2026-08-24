import {ReactNode, useState} from 'react';
import {Tooltip} from '@/components';
import {cn} from '@/utils/cn.ts';
import {useTranslation} from '@/i18n';
import {useSettingsOrNull} from '@/contexts/SettingsContext';
import {SettingKey} from '@/types/settings';
import {WrapIcon} from './WrapIcon';

/**
 * Per-block soft-wrap control (#179 follow-up).
 *
 * `Settings > Appearance > Soft Wrap` already folds every monospace block at
 * once, but the reporter reads most blocks fine and only wants to fold the one
 * they are on: "default to off, so you don't waste screen soft-wrapping, but if
 * you click something, it softwraps".
 *
 * The switch is a class, not a piece of state the block reports upwards: the
 * CSS already keys off `.soft-wrap`, so putting that same class on one block
 * reuses every rule the global setting uses. `soft-wrap-off` is the mirror case
 * — the setting is on and this is the block the user wants to scroll instead.
 *
 * Returns the pieces for the caller to place rather than wrapping the block
 * itself: the call sites are shaped differently (a flex child, a bordered box,
 * a `<pre>`), and where the class and the button each have to go depends on
 * which element scrolls.
 *
 * The button must NOT be inside the element that scrolls sideways — an
 * absolutely positioned child of a scroll container scrolls with the content
 * and slides off screen. Put it on a non-scrolling ancestor that also carries
 * `group/wrap relative`.
 */
export function useSoftWrapToggle(): {
  /**
   * Goes on the block or any ancestor of it. `.soft-wrap`/`.soft-wrap-off`
   * match the block both as itself and as a descendant.
   */
  blockClassName: string;
  wrapped: boolean;
  button: ReactNode;
} {
  const {t} = useTranslation('chatTools');
  // useSettingsOrNull, not useSettings: these blocks render in places without a
  // SettingsProvider (and in tests), where useSettings throws. No provider means
  // the setting's own default — unwrapped.
  const settings = useSettingsOrNull();
  const defaultWrapped = settings?.settings[SettingKey.SOFT_WRAP] === true;

  // `null` = untouched, so the block keeps following the setting. Storing the
  // resolved boolean instead would freeze this block at whatever the setting
  // was on first render and stop tracking later changes to it.
  const [override, setOverride] = useState<boolean | null>(null);
  const wrapped = override ?? defaultWrapped;
  const label = wrapped ? t('tool.softWrap.unwrap') : t('tool.softWrap.wrap');

  const button = (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={wrapped}
        onClick={(e) => {
          // The tool blocks expand on click; without this the same click that
          // folds the lines also resizes the box under the pointer.
          e.stopPropagation();
          setOverride(!wrapped);
        }}
        className={cn(
          'absolute end-1 top-1 z-10 rounded p-1 opacity-0 transition-opacity',
          'text-text-tertiary hover:text-text-primary hover:bg-surface-hover',
          'group-hover/wrap:opacity-100 focus-visible:opacity-100',
        )}
      >
        <WrapIcon active={wrapped} />
      </button>
    </Tooltip>
  );

  return {
    blockClassName: wrapped ? 'soft-wrap' : 'soft-wrap-off',
    wrapped,
    button,
  };
}
