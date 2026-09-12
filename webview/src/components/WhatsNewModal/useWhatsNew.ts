import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usePluginUpdates } from '@/hooks/usePluginUpdates';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import {
  markVersionSeen,
  readLastSeenVersion,
  shouldShowWhatsNew,
  subscribeLastSeenVersion,
} from './lastSeenVersion';
import type { WhatsNewRelease } from './index';

interface UseWhatsNewReturn {
  /** True once the installed version differs from the last one we showed. */
  isOpen: boolean;
  /** Newest release first, straight from the marketplace listing. */
  releases: WhatsNewRelease[];
  /** The installed version, so the modal can open on that release's page. */
  pluginVersion: string;
  close: () => void;
}

/**
 * Decides whether the "what's new" modal opens on this launch.
 *
 * Opening is driven by the installed version alone, not by anything the chat UI
 * holds, so a user who updates and relaunches sees the notes exactly once no
 * matter which screen they land on.
 */
export function useWhatsNew(): UseWhatsNewReturn {
  const { updates } = usePluginUpdates();
  const { pluginVersion } = useVersionInfo();

  const lastSeen = useSyncExternalStore(
    subscribeLastSeenVersion,
    readLastSeenVersion,
    () => null,
  );

  const eligible = shouldShowWhatsNew(pluginVersion, lastSeen);

  // A first-ever launch records the version without showing anything: the modal
  // reports what changed since last time, and there is no last time yet.
  useEffect(() => {
    if (lastSeen !== null) return;
    if (!pluginVersion || pluginVersion === 'unknown' || pluginVersion === '...') return;
    markVersionSeen(pluginVersion);
  }, [lastSeen, pluginVersion]);

  const close = useCallback(() => {
    markVersionSeen(pluginVersion);
  }, [pluginVersion]);

  return {
    // The notes have to be in hand: opening an empty modal would burn the one
    // showing we get, since closing it records the version as seen.
    isOpen: eligible && updates.length > 0,
    releases: updates,
    pluginVersion,
    close,
  };
}
