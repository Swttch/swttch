import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePluginUpdates } from '@/hooks/usePluginUpdates';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import type { WhatsNewRelease } from './index';

interface UseWhatsNewReturn {
  /** True once the backend says this launch has notes to show and they are in hand. */
  isOpen: boolean;
  /** Newest release first, straight from the marketplace listing. */
  releases: WhatsNewRelease[];
  /** The version to open on, so the modal lands on that release's page. */
  pluginVersion: string;
  close: () => void;
}

/**
 * Decides whether the "what's new" modal opens on this launch.
 *
 * The decision itself is not made here. The backend makes it while starting up, by comparing
 * the version baked into its own bundle against the last one it recorded in
 * `~/.claude-code-gui/profile.json`, and this hook only asks for the answer.
 *
 * That split is the point. The record used to live in the webview's `localStorage`, which is
 * partitioned per origin — and in JetBrains mode the webview is served from
 * `http://localhost:<a fresh port every launch>`. Every IDE restart therefore handed the webview
 * an empty store, so there was never a previous version to compare against and the modal could
 * never open (#453).
 */
export function useWhatsNew(): UseWhatsNewReturn {
  const { updates } = usePluginUpdates();
  const { isConnected, send } = useBridgeContext();
  const queryClient = useQueryClient();

  const { data: pendingVersion } = useQuery<string | null, Error>({
    queryKey: [MessageType.GET_WHATS_NEW],
    enabled: isConnected,
    // The backend settled this once while booting, so re-asking can only return the same
    // answer until this process restarts.
    staleTime: Infinity,
    queryFn: async () => {
      const result = (await send(MessageType.GET_WHATS_NEW)) as {
        status?: string;
        version?: string | null;
      };
      return result?.status === 'ok' ? (result.version ?? null) : null;
    },
  });

  const close = useCallback(() => {
    // Close on the spot rather than waiting for the backend to answer: the click already said
    // what the user wants, and a round trip would leave the modal sitting there.
    queryClient.setQueryData([MessageType.GET_WHATS_NEW], null);
    if (pendingVersion) {
      void send(MessageType.SET_WHATS_NEW_SEEN, { version: pendingVersion });
    }
  }, [pendingVersion, queryClient, send]);

  return {
    // The notes have to be in hand: opening an empty modal would burn the one showing we get,
    // since closing it records the version as seen.
    isOpen: Boolean(pendingVersion) && updates.length > 0,
    releases: updates,
    pluginVersion: pendingVersion ?? '',
    close,
  };
}
