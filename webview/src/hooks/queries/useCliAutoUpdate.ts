import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { CliUpdateChannel, MessageType, type CliAutoUpdateState } from '@/shared';

interface RawState extends Partial<CliAutoUpdateState> {
  status?: string;
  error?: string;
}

export interface UseCliAutoUpdateResult {
  state: CliAutoUpdateState | null;
  saving: boolean;
  /** Write or remove `env.DISABLE_AUTOUPDATER` in the user settings file. */
  setEnabled: (enabled: boolean) => Promise<void>;
  /** Write `autoUpdatesChannel` in the user settings file; LATEST, the CLI's default, removes it. */
  setChannel: (channel: CliUpdateChannel) => Promise<void>;
}

function toState(r: RawState): CliAutoUpdateState {
  return {
    enabled: r.enabled ?? true,
    lock: r.lock ?? null,
    settingsPath: r.settingsPath ?? '',
    channel: r.channel ?? CliUpdateChannel.LATEST,
  };
}

/**
 * Claude Code's own auto-update setting (GET_CLI_AUTO_UPDATE / SET_CLI_AUTO_UPDATE).
 *
 * Re-read whenever the backend reports that Claude's settings files changed, so a
 * `DISABLE_AUTOUPDATER` edited by hand in `settings.json` shows up here without a reload.
 */
export function useCliAutoUpdate(): UseCliAutoUpdateResult {
  const { isConnected, send, subscribe } = useBridgeContext();
  const queryClient = useQueryClient();

  useEffect(() => subscribe(MessageType.CLAUDE_SETTINGS_CHANGED, () => {
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLI_AUTO_UPDATE] });
  }), [subscribe, queryClient]);

  const query = useQuery<CliAutoUpdateState, Error>({
    queryKey: [MessageType.GET_CLI_AUTO_UPDATE],
    enabled: isConnected,
    queryFn: async () => {
      const r = (await send(MessageType.GET_CLI_AUTO_UPDATE)) as RawState;
      if (r?.status === 'ok') return toState(r);
      throw new Error(r?.error ?? 'Failed to read the auto-update setting');
    },
  });

  const mutation = useMutation<CliAutoUpdateState, Error, boolean>({
    mutationFn: async (enabled) => {
      const r = (await send(MessageType.SET_CLI_AUTO_UPDATE, { enabled })) as RawState;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Failed to save the auto-update setting');
      return toState(r);
    },
    onSuccess: (state) => {
      queryClient.setQueryData([MessageType.GET_CLI_AUTO_UPDATE], state);
    },
  });

  // The same save the other Claude-native rows use, pinned to the user scope: the CLI is
  // shared by every project, so a project-level channel would mean nothing to it.
  const channelMutation = useMutation<void, Error, CliUpdateChannel>({
    mutationFn: async (channel) => {
      const r = (await send(MessageType.SAVE_CLAUDE_SETTINGS, {
        key: 'autoUpdatesChannel',
        value: channel === CliUpdateChannel.LATEST ? null : channel,
        scope: 'global',
      })) as RawState;
      if (r?.status === 'error') throw new Error(r.error ?? 'Failed to save the update channel');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLI_AUTO_UPDATE] });
    },
  });

  return {
    state: query.data ?? null,
    saving: mutation.isPending || channelMutation.isPending,
    setEnabled: async (enabled) => { await mutation.mutateAsync(enabled); },
    setChannel: async (channel) => { await channelMutation.mutateAsync(channel); },
  };
}
