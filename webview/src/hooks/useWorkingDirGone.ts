import { useCallback, useEffect, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';
import { useOnWindowFocus } from '@/hooks/useOnWindowFocus';
import { WorkingDirMissingError } from '@/hooks/WorkingDirMissingError';

/**
 * Whether the folder this session works in is no longer on disk.
 *
 * It is asked once when the session is opened, and again each time the window is
 * returned to, because the folder can be deleted, or put back, while the user is
 * away. A message that fails to send for the same reason also answers it, so a folder
 * that vanishes while the session is open is caught by the first message rather than
 * left for the next visit.
 *
 * @param streamError the error the last message ended with, if any.
 */
export function useWorkingDirGone(streamError: Error | null): boolean {
  const { isConnected, send, subscribe } = useBridgeContext();
  const { workingDirectory } = useWorkingDir();
  const [gone, setGone] = useState(false);

  const ask = useCallback(() => {
    if (!isConnected || !workingDirectory) return;
    void send(MessageType.GET_WORKING_DIR_STATUS, { workingDir: workingDirectory });
  }, [isConnected, workingDirectory, send]);

  // What was learned about one folder says nothing about the next.
  useEffect(() => {
    setGone(false);
  }, [workingDirectory]);

  useEffect(() => {
    if (!isConnected || !workingDirectory) return;
    const unsubscribe = subscribe(MessageType.WORKING_DIR_STATUS, (message) => {
      // An answer about a folder this screen has since left is not about this one.
      if (message.payload?.workingDir !== workingDirectory) return;
      setGone(message.payload?.gone === true);
    });
    ask();
    return unsubscribe;
  }, [isConnected, workingDirectory, subscribe, ask]);

  useOnWindowFocus(ask);

  return gone || streamError instanceof WorkingDirMissingError;
}
