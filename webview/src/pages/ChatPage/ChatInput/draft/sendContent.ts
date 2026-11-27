import { emptyContent, type ComposerContent } from '@/shared';
import type { LoadedMessageDto } from '@/types';
import { AGENT_TRIGGER } from '@/utils/findAgentToken';
import { recalledText } from '../../sendText';
import { readFirstSessionMention, stripSessionMentionTags } from '../sessionMentionTag';

/**
 * What the composer shows when a send is recalled from the history: the send as it was in the box before it went out.
 *
 * A send that addressed another session carries its `<session-mention>` tag. Dropping the tag and keeping the words
 * would leave `@@some title` looking addressed while the next Enter sent it to this session, so the tag is read back
 * into the recipient and only its label goes into the text.
 */
export function sendContent(message: LoadedMessageDto): ComposerContent {
  const raw = recalledText(message);
  const mention = readFirstSessionMention(raw);
  return {
    ...emptyContent(),
    text: stripSessionMentionTags(raw),
    recipient: mention
      ? {
          name: mention.agentName,
          sessionId: mention.sessionId,
          sessionDir: mention.sessionDir,
          label: mention.label.startsWith(AGENT_TRIGGER) ? mention.label.slice(AGENT_TRIGGER.length) : mention.label,
          token: mention.label,
        }
      : null,
  };
}
