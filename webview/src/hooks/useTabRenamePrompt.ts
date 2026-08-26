import { useCallback, useEffect, useState } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';

interface TabRenamePrompt {
  /** Non-null while the rename dialog should be showing. */
  initialName: string | null;
  confirm: (name: string) => void;
  cancel: () => void;
}

/**
 * Opens the rename dialog when the IDE reports that this tab's "Rename
 * Session..." menu item was used, and reports the answer back.
 *
 * The IDE deliberately renames nothing itself — its in-place popup is a Swing
 * balloon and takes no input over the JCEF browser a chat tab lives in — so the
 * menu item only says *which* tab, and the prompt is drawn here (issue #301).
 *
 * The backend routes the request by panel, so a message arriving here is always
 * about this tab; nothing needs to check an id.
 */
export function useTabRenamePrompt(): TabRenamePrompt {
  const [initialName, setInitialName] = useState<string | null>(null);

  useEffect(() => {
    return getBridge().subscribe(MessageType.TAB_RENAME_REQUESTED, (message) => {
      // The IDE sends the label the tab is actually showing. Falling back to
      // document.title covers only the case where it sent nothing: the two agree
      // until the tab is given a name of its own, and after that document.title
      // is the conversation's and would reopen the field on the old value.
      const current = message.payload?.currentName;
      setInitialName(typeof current === 'string' && current ? current : document.title);
    });
  }, []);

  const confirm = useCallback((name: string) => {
    setInitialName(null);
    // Fire-and-forget: the IDE owns the value from here, and the tab label
    // updating is the confirmation. An empty name clears it.
    void getBridge().request(MessageType.SET_TAB_NAME, { name });
  }, []);

  const cancel = useCallback(() => setInitialName(null), []);

  return { initialName, confirm, cancel };
}
