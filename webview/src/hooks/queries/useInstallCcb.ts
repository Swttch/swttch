import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { INSTALL_REQUEST_TIMEOUT_MS } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';

interface RawInstallResult {
  status?: string;
  error?: string;
}

/**
 * INSTALL_CCB mutation — asks the backend to install the ccb CLI
 * (`npm i -g`) so the usage panel works without the user opening a terminal or
 * hitting the PowerShell execution-policy wall. On success we invalidate the
 * usage queries so the panel refetches and the "not installed" notice is
 * replaced by real data. On failure the backend returns a runnable command
 * (with sudo where a global location needs elevation) as the error message.
 */
export function useInstallCcb() {
  const { send } = useBridgeContext();
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      // Installing downloads + links; wait as long as the backend does (180s +
      // margin) so a slow install's result reaches us instead of a silent stall.
      const r = (await send(MessageType.INSTALL_CCB, {}, { timeout: INSTALL_REQUEST_TIMEOUT_MS })) as RawInstallResult;
      if (r?.status !== 'ok') throw new Error(r?.error ?? 'Failed to install the ccb CLI');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE] });
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_USAGE_REPORT] });
    },
  });

  const install = useCallback(() => mutation.mutateAsync(), [mutation]);
  return { install, installing: mutation.isPending };
}
