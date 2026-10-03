import React from 'react';
import { LoadedMessageDto, getTextContent } from '../../../types';
import { AssistantMessageRenderer } from './AssistantMessageRenderer';

interface SystemMessageRendererProps {
  message: LoadedMessageDto;
}

const LOCAL_COMMAND_STDOUT_TAG = /<\/?local-command-stdout>/g;

/**
 * What a slash command printed, as the reply it was when it streamed.
 *
 * Live, the CLI delivers that output as an assistant message ("Session renamed
 * to: ..."). The transcript stores the same words as a `system` entry of subtype
 * `local_command`, with the text in `content` instead of `message`. Drawing it
 * through the assistant renderer makes a reloaded session show the reply the
 * live one showed.
 */
function localCommandReply(message: LoadedMessageDto): LoadedMessageDto | null {
  if (message.subtype !== 'local_command') return null;
  const text = (message.content ?? '').replace(LOCAL_COMMAND_STDOUT_TAG, '').trim();
  if (!text) return null;
  return Object.assign(new LoadedMessageDto(), message, {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  }) as LoadedMessageDto;
}

export const SystemMessageRenderer: React.FC<SystemMessageRendererProps> = ({ message }) => {
  const reply = localCommandReply(message);
  if (reply) return <AssistantMessageRenderer message={reply} />;

  return (
    <div className="justify-center py-3 hidden">
      <div className="px-4 py-2 bg-surface-hover border border-border-default/50 rounded-lg text-[0.7692rem] text-text-secondary font-mono">
        {getTextContent(message)}
      </div>
    </div>
  );
};
