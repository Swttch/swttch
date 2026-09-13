import { WhatsNewModal } from './index';
import { useWhatsNew } from './useWhatsNew';

/**
 * Mount point for the post-update release notes.
 *
 * It is a slot rather than state in ChatPage so that the decision to open lives
 * with the version check, not with whichever screen happens to be rendered.
 */
export function WhatsNewSlot() {
  const { isOpen, releases, pluginVersion, close } = useWhatsNew();

  if (!isOpen) return null;

  return (
    <WhatsNewModal
      releases={releases}
      initialVersion={pluginVersion}
      onClose={close}
    />
  );
}
