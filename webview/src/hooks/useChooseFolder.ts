import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { Route, routeToPath, withWorkingDir } from '@/router/routes';
import { MessageType } from '@/shared';

/**
 * Opens the host's folder dialog and, when a folder is chosen, starts a new session in
 * it. Every place that offers "pick a folder to work in" runs this one flow, so the
 * dialog, its failure message and where the user lands cannot differ between them.
 *
 * @param onChosen runs once a folder was chosen, before the navigation.
 */
export function useChooseFolder(onChosen?: () => void): () => void {
  const { send, subscribe } = useBridgeContext();
  const navigate = useNavigate();

  return useCallback(() => {
    const unsubscribe = subscribe(MessageType.FOLDER_SELECTED, (message) => {
      unsubscribe();
      // The host could not show its folder dialog; the reason is the backend's.
      if (typeof message.payload?.error === 'string') toast.error(message.payload.error);
      const selectedPath = message.payload?.path;
      if (typeof selectedPath === 'string' && selectedPath.length > 0) {
        // macOS folder dialog appends a trailing slash; strip it so the URL
        // matches sessions-index `projectPath` exactly (no slash).
        const normalized = selectedPath.replace(/\/+$/, '') || selectedPath;
        onChosen?.();
        navigate(withWorkingDir(routeToPath(Route.NEW_SESSION), normalized));
      }
    });
    void send(MessageType.OPEN_FOLDER_DIALOG, {});
  }, [send, subscribe, navigate, onChosen]);
}
