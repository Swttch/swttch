import { useEffect } from 'react';
import { StaticItem } from '../../types';
import { i18n } from '@/i18n';
import { enKeyword } from '../../enKeyword';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useEnableAllowAllCommands } from '@/hooks/useEnableAllowAllCommands';

export const ALLOW_ALL_COMMANDS_TOGGLE_EVENT = 'allow-all-commands-toggle';

/**
 * Model-section toggle for answering the CLI's unskippable safety prompts
 * without showing the approval panel, placed at the bottom of the section.
 *
 * Session-local: it applies to the open conversation only and is off again in a
 * new one. Turning it on goes through the same warning as the Enable link on the
 * approval panel; turning it off needs none, since it only brings the panel back.
 */
export const createToggleAllowAllCommandsItem = (): StaticItem =>
  new StaticItem('toggle-allow-all-commands', i18n.t('commandPalette:model.toggleAllowAllCommands'), {
    keywords: [
      enKeyword('commandPalette:model.toggleAllowAllCommands'),
      'allow all',
      'allow all command',
      'bypass',
      'approval',
    ],
    disabled: false,
    keepOpen: true,
    valueComponent: () => <AllowAllCommandsToggle />,
    action: async () => {
      window.dispatchEvent(new CustomEvent(ALLOW_ALL_COMMANDS_TOGGLE_EVENT));
    },
  });

const AllowAllCommandsToggle = () => {
  const { enabled, enable, disable } = useEnableAllowAllCommands();

  const apply = (value: boolean): void => {
    if (value) void enable();
    else disable();
  };

  // Row (Enter/click) toggles it.
  useEffect(() => {
    const handler = () => apply(!enabled);
    window.addEventListener(ALLOW_ALL_COMMANDS_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(ALLOW_ALL_COMMANDS_TOGGLE_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, enable, disable]);

  return (
    <ToggleSwitch
      checked={enabled}
      onChange={apply}
      size="small"
    />
  );
};
