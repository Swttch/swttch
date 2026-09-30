import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType, type NonessentialTrafficState } from '@/shared';

interface RawState extends Partial<NonessentialTrafficState> {
  status?: string;
  error?: string;
}

export interface UseNonessentialTrafficResult {
  state: NonessentialTrafficState | null;
  saving: boolean;
  /** Write `env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` in the user settings file, or lift it. */
  setDisabled: (disabled: boolean) => Promise<void>;
}

function toState(r: RawState): NonessentialTrafficState {
  return {
    disabled: r.disabled ?? false,
    lock: r.lock ?? null,
    settingsPath: r.settingsPath ?? '',
  };
}

/**
 * Claude Code's essential-traffic-only switch (GET_NONESSENTIAL_TRAFFIC / SET_NONESSENTIAL_TRAFFIC).
 *
 * A change also moves Claude Code's auto-update switch on the About screen, which reads the
 * same variable, so a save refreshes that query too.
 */
export function useNonessentialTraffic(): UseNonessentialTrafficResult {
  const { isConnected, send, subscribe } = useBridgeContext();
  const queryClient = useQueryClient();

  useEffect(() => subscribe(MessageType.CLAUDE_SETTINGS_CHANGED, () => {
    void queryClient.invalidateQueries({ queryKey: [MessageType.GET_NONESSENTIAL_TRAFFIC] });
  }), [subscribe, queryClient]);

  const query = useQuery<NonessentialTrafficState, Error>({
    queryKey: [MessageType.GET_NONESSENTIAL_TRAFFIC],
    enabled: isConnected,
    queryFn: async () => {
      const r = (await send(MessageType.GET_NONESSENTIAL_TRAFFIC)) as RawState;
      if (r?.status === 'ok') return toState(r);
      throw new Error(r?.error ?? 'Failed to read the nonessential traffic setting');
    },
  });

  const mutation = useMutation<NonessentialTrafficState, Error, boolean>({
    mutationFn: async (disabled) => {
      const r = (await send(MessageType.SET_NONESSENTIAL_TRAFFIC, { disabled })) as RawState;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Failed to save the nonessential traffic setting');
      return toState(r);
    },
    onSuccess: (state) => {
      queryClient.setQueryData([MessageType.GET_NONESSENTIAL_TRAFFIC], state);
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_CLI_AUTO_UPDATE] });
    },
  });

  return {
    state: query.data ?? null,
    saving: mutation.isPending,
    setDisabled: async (disabled) => { await mutation.mutateAsync(disabled); },
  };
}
