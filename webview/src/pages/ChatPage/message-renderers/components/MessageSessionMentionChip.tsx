import React from 'react';
import toast from 'react-hot-toast';
import { getAdapter } from '../../../../adapters';
import { i18n } from '@/i18n';
import type { SessionMention } from '../../ChatInput/sessionMentionTag';

interface Props {
  mention: SessionMention;
}

/**
 * A `<session-mention>` from a submitted message: the session this message was
 * addressed to, drawn the way the composer drew it before it was sent.
 *
 * Wears `richInputChip`, the same class the composer's mirror and the file chip
 * use, so all three chips in this app are one chip seen in three places rather
 * than three that happen to look alike.
 *
 * **Clicking opens that conversation in a NEW tab, and does not take this one
 * over.** The session is already running somewhere — that is what put it in the
 * `@@` list — so replacing this tab with it would show one live conversation in
 * two places. And the reason to click a mention is to see what was referenced,
 * not to leave: a switch that dropped the conversation being read would answer a
 * question by taking away the page that asked it.
 *
 * The same choice the session panel already makes. The session dropdown makes
 * the opposite one, and rightly: there the user is deliberately changing what
 * this tab is showing.
 *
 * `session-dir` rides along because the list this chip came from spans the whole
 * machine. Without it a session belonging to another project opens against the
 * wrong one, and `findProjectByBasePath` is what the IDE side uses to land in
 * the right window.
 */
export const MessageSessionMentionChip = (props: Props) => {
  const { mention } = props;

  const open = (event: React.SyntheticEvent) => {
    // Stop the parent MessageBox from toggling its expand/collapse state.
    event.stopPropagation();
    getAdapter()
      .openSession(mention.sessionId, mention.sessionDir)
      .catch((err) => {
        console.error('[MessageSessionMentionChip] Failed to open session:', err);
        toast.error(i18n.t('chat:chatInput.agentMentionDropdown.openSessionFailed'));
      });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(event);
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      className="richInputChip cursor-pointer"
      title={mention.agentName}
      data-session-id={mention.sessionId}
      onClick={open}
      onKeyDown={handleKeyDown}
    >
      {mention.label}
    </span>
  );
};
