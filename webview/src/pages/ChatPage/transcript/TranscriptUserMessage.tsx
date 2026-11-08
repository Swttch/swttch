import { useMemo } from 'react';
import { LoadedMessageDto, getTextContent, isContentBlockArray } from '../../../types';
import type { ImageBlockDto } from '../../../dto/message/ContentBlockDto';
import { ContentBlockType } from '../../../dto/message/ContentBlockDto';
import { parseUserContent, stripSystemReminders } from '../message-renderers/utils/parseUserContent';
import { parseSessionBrief } from '../message-renderers/utils/sessionBrief';
import { parseCrossSessionMessage } from '../message-renderers/CrossSessionMessageRenderer';
import { UserMessageRenderer } from '../message-renderers/UserMessageRenderer';
import { ContextPills } from '../message-renderers/components/ContextPills';
import { ImageAttachments } from '../message-renderers/components/ImageAttachments';
import { ReplyQuotes } from '../message-renderers/components/ReplyQuotes';
import { ExcerptCards } from '../message-renderers/components/ExcerptCards';
import { UserMessageText } from '../message-renderers/components/UserMessageText';
import { IfVisible, hasVisibleGlyph } from '../message-renderers/components/IfVisible';
import { toolResultText } from '../message-renderers/ToolRenderers/common/toolStatus';
import { stripSessionMentionTags } from '../ChatInput/sessionMentionTag';
import { commandSendText } from '../sendText';
import { useSendActionsValue } from '../SendActionsContext';
import { isCompactSummaryEntry } from './compact';
import { TranscriptSessionBrief } from './TranscriptSessionBrief';
import { TranscriptUserFooter } from './TranscriptUserFooter';

const INTERRUPTED_TEXT = '[Request interrupted by user]';
const INTERRUPTED_FOR_TOOL_USE_TEXT = '[Request interrupted by user for tool use]';

interface Props {
  message: LoadedMessageDto;
  /** The key of the send this message heads, or null for an entry in a section's body. */
  sectionKey: string | null;
}

/**
 * What the user sent, drawn the way the desktop app's Transcript view draws it:
 * a bubble on the right, with the copy / fork / time row under it, also on the
 * right. There is no fold arrow beside it and it does not pin itself to the top
 * of the chat, so this file has no counterpart to `SendFoldToggle`,
 * `StickySendHeader` or the scroll fold.
 *
 * Only a send the user typed (or a slash command) is drawn here. The other things
 * that arrive as a `user` entry are notices and cards with a layout of their own
 * (an interrupted turn, a message from another session, a session brief, a model
 * change, a tool result that could not be folded into its card), and those are
 * the classic renderer's to draw: they are not bubbles on either side.
 */
export function TranscriptUserMessage(props: Props) {
  // The summary a compaction hands the model is not something the user sent, and it is not drawn.
  if (isCompactSummaryEntry(props.message)) return null;
  return <SendBubble {...props} />;
}

function SendBubble({ message, sectionKey }: Props) {
  const sendActions = useSendActionsValue();
  const text = getTextContent(message);
  const parsed = parseUserContent(text);

  const imageBlocks = useMemo(() => {
    const content = message.message?.content;
    if (!isContentBlockArray(content)) return [];
    return content.filter((b): b is ImageBlockDto => b.type === ContentBlockType.Image);
  }, [message.message?.content]);

  const contexts = [...(parsed.contexts || []), ...(message.context || [])];
  const trimmed = parsed.text.trim();

  const isOtherKind =
    message.origin?.kind === 'peer' ||
    Boolean(parseCrossSessionMessage(text)) ||
    Boolean(parseSessionBrief(stripSystemReminders(text).trimStart())) ||
    trimmed === INTERRUPTED_TEXT ||
    trimmed === INTERRUPTED_FOR_TOOL_USE_TEXT ||
    parsed.hasLocalCommandStdout ||
    parsed.commandName === 'model' ||
    (!trimmed && !hasVisibleGlyph(parsed.commandName) && parsed.replies.length === 0 && imageBlocks.length === 0 && toolResultText(message).trim() !== '');
  // The first message of a session another session started is a brief, drawn as the desktop app's own card.
  const brief = parseSessionBrief(stripSystemReminders(text).trimStart());
  if (brief) return <TranscriptSessionBrief brief={brief} message={message} />;
  if (isOtherKind) return <UserMessageRenderer message={message} />;

  if (parsed.hasLocalCommandCaveat && !parsed.text && !parsed.commandName) return null;

  const isCommand = hasVisibleGlyph(parsed.commandName);
  const hasBubble = isCommand || trimmed !== '' || parsed.replies.length > 0;
  if (!hasBubble && imageBlocks.length === 0 && contexts.length === 0 && parsed.excerpts.length === 0) return null;

  const copyText = isCommand
    ? commandSendText(parsed.commandName, parsed.text)
    : hasBubble
      ? stripSessionMentionTags(parsed.text)
      : undefined;

  const footer = (
    <TranscriptUserFooter
      copyText={copyText}
      onRewind={
        sendActions && sectionKey !== null && sendActions.canRewind(sectionKey)
          ? () => sendActions.rewindCode(sectionKey)
          : undefined
      }
      onFork={
        sendActions && sectionKey !== null && sendActions.canFork(sectionKey)
          ? () => sendActions.forkConversation(sectionKey)
          : undefined
      }
      timestamp={message.timestamp}
      alwaysDisplay
    />
  );
  // The copy / fork / time row is invisible until the pointer is on the send, but an invisible row still takes
  // its height, which put a gap under every bubble that the desktop app does not have. Under a bubble alone it
  // is laid over the space below instead of in the flow. With pictures or context chips under the bubble it
  // stays in the flow, below them, so it never lies on top of them.
  const footerOverlaid = imageBlocks.length === 0 && contexts.length === 0;

  return (
    <IfVisible
      extra={imageBlocks.length > 0 || contexts.length > 0 || parsed.replies.length > 0 || parsed.excerpts.length > 0}
    >
      <div className="group flex flex-col items-end gap-1.5 pt-2 pb-[32px] pl-4 pr-7" data-transcript-user>
        {parsed.excerpts.length > 0 && <ExcerptCards excerpts={parsed.excerpts} />}

        {hasBubble && (
          <div className="max-w-[37rem] min-w-0 rounded-2xl bg-surface-hover px-3.5 py-2">
            {parsed.replies.length > 0 && <ReplyQuotes replies={parsed.replies} followedByText={parsed.text !== ''} />}
            <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">
              {isCommand ? (
                <>
                  <span className="text-text-primary/50">{'/'}</span>
                  {parsed.commandName}
                  {parsed.text && <span className="text-text-primary/50">{' '}{parsed.text}</span>}
                </>
              ) : (
                <UserMessageText text={parsed.text} />
              )}
            </div>
          </div>
        )}

        {imageBlocks.length > 0 && <ImageAttachments images={imageBlocks} entryUuid={message.uuid} />}
        {contexts.length > 0 && <ContextPills context={contexts} />}

        {hasBubble && footerOverlaid && (
          <div className="relative h-0 self-stretch">
            <div className="absolute end-0 top-0 z-[1]">{footer}</div>
          </div>
        )}
        {hasBubble && !footerOverlaid && footer}
      </div>
    </IfVisible>
  );
}
