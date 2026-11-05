import React from 'react';
import { getTextContent, type LoadedMessageDto } from '@/types';
import { useChatInputState } from '@/contexts/ChatInputStateContext';
import { useChatStreamContextOrNull } from '@/contexts/ChatStreamContext';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { WrapUpBox, findWrapUpInput } from './message-renderers/ToolRenderers/Mcp/CcdTurn';
import { parseUserContent } from './message-renderers/utils/parseUserContent';

/**
 * The box that closes a turn, as in Claude Desktop: after the turn's last message, where the model's `wrap_up`
 * call sits ahead of its closing message. `body` is the turn's messages and `next` the send that came after it,
 * whose text tells whether the question has been answered. While none has, its answers can be pressed: each
 * goes out as the user's next send, the way a typed reply would.
 */
export const TurnWrapUp: React.FC<{ body: LoadedMessageDto[]; next: LoadedMessageDto | null }> = ({ body, next }) => {
  const stream = useChatStreamContextOrNull();
  const inputMode = useSessionContextOrNull()?.inputMode;
  const { composerHasContent } = useChatInputState();
  const wrapUp = findWrapUpInput(body);
  if (!wrapUp) return null;
  const reply = next ? parseUserContent(getTextContent(next)).text : undefined;
  const sendMessage = stream?.sendMessage;
  const onAnswer =
    next === null && sendMessage && inputMode !== undefined ? (text: string) => sendMessage(text, inputMode) : undefined;
  return <WrapUpBox input={wrapUp} reply={reply} onAnswer={onAnswer} composerEmpty={!composerHasContent} />;
};
