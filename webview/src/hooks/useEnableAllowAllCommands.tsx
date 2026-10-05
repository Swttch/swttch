import { useCallback } from 'react';
import { useAllowAllCommands } from '@/contexts/AllowAllCommandsContext';
import { useSessionContext } from '@/contexts/SessionContext';

interface UseEnableAllowAllCommandsReturn {
  /** Whether the current conversation already answers the safety prompts itself. */
  enabled: boolean;
  /** Turn it off. Needs no confirmation: it only brings the panel back. */
  disable: () => void;
  /** Warn first, then turn it on. Resolves to whether it was turned on. */
  enable: () => Promise<boolean>;
  /** The warning is on screen. */
  confirmOpen: boolean;
}

/**
 * The one way to turn on "Allow all command in this session".
 *
 * Both entry points, the Enable link on a disabled approval option and the
 * toggle in the slash command panel, go through here, so neither can switch it
 * on without the user having read what it hands over.
 */
export function useEnableAllowAllCommands(): UseEnableAllowAllCommandsReturn {
  const { currentSessionId } = useSessionContext();
  const { isEnabled, setEnabled, requestEnable, confirmOpen } = useAllowAllCommands();

  const disable = useCallback((): void => {
    setEnabled(currentSessionId, false);
  }, [currentSessionId, setEnabled]);

  return { enabled: isEnabled(currentSessionId), disable, enable: requestEnable, confirmOpen };
}
