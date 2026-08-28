import { useCallback } from 'react';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useBridge } from '@/hooks/useBridge';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { SettingKey } from '@/types/settings';
import { MessageType } from '@/shared';

/**
 * Switches the model for the current session, and — when
 * {@link SettingKey.SYNC_MODEL_TO_DEFAULT} is on — also writes the native
 * `model` default, so the change survives a Clear Conversation / new session
 * the way the CLI's own `/model` always has (issue #354).
 *
 * Shared by the model dropdown ({@link ModelSwitchOverlay}) and the rotate
 * shortcut ({@link ModelTag}) so the sync behaviour lives in one place; each
 * caller still does its own local-feedback notification afterwards.
 */
export function useModelSwitch(): (value: string) => Promise<void> {
  const { setSessionModel } = useChatStreamContext();
  const { currentSessionId } = useSessionContext();
  const { send } = useBridge();
  const { settings } = useSettings();
  const { updateSetting: updateClaudeSetting } = useClaudeSettings();

  return useCallback(
    async (value: string) => {
      setSessionModel(value);

      const requests: Promise<unknown>[] = [];
      if (currentSessionId) {
        requests.push(send(MessageType.SET_MODEL, { model: value }));
      }
      if (settings[SettingKey.SYNC_MODEL_TO_DEFAULT]) {
        requests.push(updateClaudeSetting('model', value));
      }
      await Promise.all(requests);
    },
    [setSessionModel, currentSessionId, send, settings, updateClaudeSetting],
  );
}
