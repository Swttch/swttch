import { useEffect, useRef } from 'react';

/**
 * Glide to the bottom the moment the user sends something from this modal.
 *
 * The main chat does not need this: the message just sent is put on screen in
 * the same instant, the content grows, and following does the rest. An agent's
 * transcript only shows the message once the CLI has resumed the agent and
 * written it down, which takes a few seconds, and until then nothing grows.
 * Following alone would leave the view where the user had scrolled it, with the
 * "Scroll to bottom" button hidden (following is on), for that whole wait.
 *
 * The count at mount is not a send, so a transcript opened after earlier sends
 * (another agent picked, the modal reopened) is not moved.
 */
export function useGlideOnSend(sendCount: number, scrollToBottom: () => void): void {
  const seen = useRef(sendCount);
  useEffect(() => {
    if (sendCount === seen.current) return;
    seen.current = sendCount;
    scrollToBottom();
  }, [sendCount, scrollToBottom]);
}
