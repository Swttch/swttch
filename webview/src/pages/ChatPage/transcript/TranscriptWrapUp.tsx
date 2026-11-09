import type { FC } from 'react';
import { getTextContent, type LoadedMessageDto } from '@/types';
import { useChatInputState } from '@/contexts/ChatInputStateContext';
import { useChatStreamContextOrNull } from '@/contexts/ChatStreamContext';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { WrapUpBox, findWrapUpInput } from '../message-renderers/ToolRenderers/Mcp/CcdTurn';
import { parseUserContent } from '../message-renderers/utils/parseUserContent';
import { StreamingMessage } from '../StreamingMessage';
import { hasTextAfterWrapUp } from './wrapUpPreview';

interface Props {
  body: LoadedMessageDto[];
  next: LoadedMessageDto | null;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

const Closing: FC<{ next: LoadedMessageDto | null; wrapUp: Record<string, unknown>; showRecap: boolean }> = ({
  next,
  wrapUp,
  showRecap,
}) => {
  const stream = useChatStreamContextOrNull();
  const inputMode = useSessionContextOrNull()?.inputMode;
  const { composerHasContent } = useChatInputState();
  const reply = next ? parseUserContent(getTextContent(next)).text : undefined;
  const sendMessage = stream?.sendMessage;
  const onAnswer =
    next === null && sendMessage && inputMode !== undefined ? (text: string) => sendMessage(text, inputMode) : undefined;
  // With a question the recap is the first thing in the box, above the question, whether or not the closing message
  // has come; without one it is only a preview of that message, drawn as text until the message begins.
  const hasQuestion = nonEmpty(wrapUp.ask) !== undefined;
  const recap = showRecap && !hasQuestion ? nonEmpty(wrapUp.recap) : undefined;

  return (
    <>
      {recap && (
        <div className="px-4 [&_.markdown-content_p:first-child]:mt-0" data-transcript-wrap-up-preview>
          <StreamingMessage
            plain
            content={recap}
            isStreaming={false}
            className="text-[var(--tr-text)] text-[1rem] leading-relaxed"
          />
        </div>
      )}
      {/* The box holds the question and its answers, and the recap above them when there is a question. It stands
          clear of the reply above it: the desktop app leaves about a line and a half between the two. */}
      <div className={hasQuestion ? 'pt-[24px]' : undefined} data-transcript-wrap-up-box>
        <WrapUpBox
          input={hasQuestion ? wrapUp : { ...wrapUp, recap: undefined }}
          reply={reply}
          onAnswer={onAnswer}
          composerEmpty={!composerHasContent}
        />
      </div>
    </>
  );
};

/**
 * What closes a turn in the Transcript view modes, after the turn's last message.
 *
 * The recap of the model's `wrap_up` call is a preview of its closing message. While that message has not
 * begun, the recap is drawn as reply text, in the reply's colour, so the reader sees the outcome as soon as it
 * is known. When the closing message starts to come in, the recap is not drawn any more and the real message,
 * streamed as the rest of the reply is, takes its place. The question and the answers under it stay a box.
 *
 * Most turns made no wrap-up call, and they touch no context at all: the check comes before anything mounts.
 */
export function TranscriptWrapUp({ body, next }: Props) {
  const wrapUp = findWrapUpInput(body);
  if (!wrapUp) return null;
  return <Closing next={next} wrapUp={wrapUp} showRecap={!hasTextAfterWrapUp(body)} />;
}
