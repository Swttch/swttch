import { useMemo, useState } from 'react';
import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { isJetBrains } from '@/config/environment';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';
import {
  COMMON_FONT_FAMILIES,
  canQueryLocalFonts,
  filterInstalled,
  hostFontFamilies,
  isFontMonospaced,
  queryAllLocalFamilies,
} from '@/utils/installedFonts';

type FontKind = 'chat' | 'code';

const DEFAULT_VALUE = '__default__';
const IDE_VALUE = '__ide__';
const LOAD_ALL_VALUE = '__load_all__';
const FONT_PREFIX = 'font:';

const KEYS = {
  chat: { family: SettingKey.CHAT_FONT_FAMILY, fromIde: SettingKey.CHAT_FONT_FROM_IDE },
  code: { family: SettingKey.CODE_FONT_FAMILY, fromIde: SettingKey.CODE_FONT_FROM_IDE },
} as const;

/** The families to offer: the ones the page can draw, and for the code font only the monospaced ones. */
function offerableFonts(kind: FontKind, source: readonly string[]): string[] {
  const installed = filterInstalled(source);
  return kind === 'code' ? installed.filter(isFontMonospaced) : installed;
}

/**
 * A font chosen from a dropdown: the chat font or the code font (issue #729).
 *
 * The dropdown offers "Default" (the built-in font), "Follow IDE" (in a JetBrains IDE: the font of the IDE's interface
 * for the chat, the font of its editor for the code), and the fonts installed on this computer, each written in its own
 * font. A font typed into the settings file that is not in the list is shown as well, so the dropdown always says what is
 * in effect. In a browser, which cannot list the fonts by itself, a short list of common ones is offered together with
 * "Show all installed fonts…", which asks the browser's permission to read the whole list.
 */
export function FontFamilyRow({ kind }: { kind: FontKind }) {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting, scope, resetToGlobal } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();
  const keys = KEYS[kind];

  const inIde = isJetBrains();
  const family = ((displaySettings[keys.family] as string | null | undefined) ?? '').trim();
  const followIde = inIde && displaySettings[keys.fromIde] === true;
  const inherited = isInherited(keys.family) && isInherited(keys.fromIde);

  const resetFamily = resetFor(keys.family);
  const resetFromIde = resetFor(keys.fromIde);

  const [allFamilies, setAllFamilies] = useState<string[] | null>(null);
  const canLoadAll = !inIde && allFamilies === null && canQueryLocalFonts();

  const fonts = useMemo(
    () => offerableFonts(kind, allFamilies ?? hostFontFamilies() ?? COMMON_FONT_FAMILIES),
    [kind, allFamilies],
  );

  const options: SelectOption[] = [{ value: DEFAULT_VALUE, label: t('appearance.theme.fontDefault') }];
  if (inIde) options.push({ value: IDE_VALUE, label: t('appearance.theme.fontFollowIde') });
  for (const name of fonts) options.push({ value: `${FONT_PREFIX}${name}`, label: name, fontFamily: `"${name}"` });
  if (family && !followIde && !fonts.some((name) => name.toLowerCase() === family.toLowerCase())) {
    // Saved earlier (or typed into the settings file) but not in the list: still shown, so the box says what is in effect.
    options.splice(inIde ? 2 : 1, 0, { value: `${FONT_PREFIX}${family}`, label: family, fontFamily: family });
  }
  if (canLoadAll) options.push({ value: LOAD_ALL_VALUE, label: t('appearance.theme.fontLoadAll'), italic: true });

  const value = followIde ? IDE_VALUE : family ? `${FONT_PREFIX}${family}` : DEFAULT_VALUE;

  const choose = (next: string) => {
    if (next === LOAD_ALL_VALUE) {
      // The browser asks the person first. A refusal leaves the short list as it was.
      queryAllLocalFamilies().then(setAllFamilies, () => undefined);
      return;
    }
    if (next === DEFAULT_VALUE) {
      if (scope === 'project') {
        resetToGlobal(keys.family);
        resetToGlobal(keys.fromIde);
      } else {
        updateSetting(keys.family, null);
        updateSetting(keys.fromIde, false);
      }
      return;
    }
    if (next === IDE_VALUE) {
      updateSetting(keys.fromIde, true);
      return;
    }
    updateSetting(keys.family, next.slice(FONT_PREFIX.length));
    if (followIde) updateSetting(keys.fromIde, false);
  };

  const label = t(`appearance.theme.${kind}Font.label`);

  return (
    <SettingRow
      label={label}
      description={t(`appearance.theme.${kind}Font.description`)}
      isOverridden={isOverridden(keys.family) || isOverridden(keys.fromIde)}
      isInherited={inherited}
      // Given only while the project overrides one of the two keys: any function makes the row wear the project badge.
      onResetToGlobal={
        resetFamily || resetFromIde
          ? () => {
              resetFamily?.();
              resetFromIde?.();
            }
          : undefined
      }
    >
      <Select
        value={value}
        options={options}
        ariaLabel={label}
        searchPlaceholder={t('appearance.theme.fontSearch')}
        noMatchLabel={t('appearance.theme.fontNoMatch')}
        onChange={choose}
        className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          inherited ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}

/** The font of the chat text and of the interface. */
export function ChatFontRow() {
  return <FontFamilyRow kind="chat" />;
}

/** The font of code blocks, tool output and diffs. */
export function CodeFontRow() {
  return <FontFamilyRow kind="code" />;
}
