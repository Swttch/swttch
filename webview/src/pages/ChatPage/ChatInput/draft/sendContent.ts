import { emptyContent, type ComposerContent, type DraftAttachment } from '@/shared';
import type { LoadedMessageDto } from '@/types';
import { AGENT_TRIGGER } from '@/utils/findAgentToken';
import { recalledText } from '../../sendText';
import { parseReplyBlocks } from '../../message-renderers/utils/replyBlocks';
import { readFirstSessionMention, stripSessionMentionTags } from '../sessionMentionTag';
import type { PictureShelf } from './composerContent';

/** A picture of a send goes by the send and its place in it, in letters a file may be named with. */
const pictureId = (key: string, at: number) => `sent-${key}-${at}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);

/** The pictures a send holds, as attachments, with their bytes put on the shelf. */
function picturesOf(message: LoadedMessageDto, shelf: PictureShelf): DraftAttachment[] {
  const blocks = message.message?.content;
  if (!Array.isArray(blocks)) return [];
  const pictures: DraftAttachment[] = [];
  for (const block of blocks) {
    const source = (block as { type?: string; source?: { type?: string; data?: string; media_type?: string } }).source;
    if (block.type !== 'image' || source?.type !== 'base64' || !source.data) continue;
    const id = pictureId(message.uuid ?? '', pictures.length);
    const mimeType = source.media_type ?? 'image/png';
    shelf.keepPicture(id, source.data);
    pictures.push({ id, type: 'image', name: `image-${pictures.length + 1}.${mimeType.split('/')[1] ?? 'png'}`, mimeType, size: Math.floor((source.data.length * 3) / 4) });
  }
  return pictures;
}

/**
 * What the composer shows when a send is recalled from the history: the send as it was in the box before it went out,
 * with its pictures in the attachment row and its reply and excerpt cards above the text.
 *
 * A send that addressed another session carries its `<session-mention>` tag. Dropping the tag and keeping the words
 * would leave `@@some title` looking addressed while the next Enter sent it to this session, so the tag is read back
 * into the recipient and only its label goes into the text.
 */
export function sendContent(message: LoadedMessageDto, shelf: PictureShelf): ComposerContent {
  const recalled = recalledText(message);
  const cards = parseReplyBlocks(recalled);
  const raw = cards ? cards.body.trim() : recalled;
  const mention = readFirstSessionMention(raw);
  const key = message.uuid ?? '';
  return {
    ...emptyContent(),
    text: stripSessionMentionTags(raw),
    attachments: picturesOf(message, shelf),
    replies: [
      ...(cards?.replies ?? []).map(({ quote, comment }) => ({ quote, comment })),
      ...(cards?.excerpts ?? []).map((quote) => ({ quote, comment: '' })),
    ].map((card, at) => ({ id: `sent-${key}-${at}`, ...card })),
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
