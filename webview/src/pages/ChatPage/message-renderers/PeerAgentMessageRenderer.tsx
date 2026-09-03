import React from 'react';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { LoadedMessageDto } from '../../../types';
import { MessageBox } from './components/MessageBox';
import { useTranslation } from '@/i18n';

interface PeerAgentMessageRendererProps {
  message: LoadedMessageDto;
}

/**
 * A `user` entry the CLI injects mid-turn when a peer Claude session (a
 * subagent or teammate, reached via the SendMessage tool) messages this one.
 * Without this, the entry falls through to the plain user-bubble path and
 * shows its raw wrapped text verbatim — including the boilerplate explaining
 * it did not come from the actual user, which has no value to a human reader
 * (issue #383). `origin.body` is the report already unwrapped, so this shows
 * just that, labeled by who it came from instead of looking like the user's
 * own words.
 */
export const PeerAgentMessageRenderer: React.FC<PeerAgentMessageRendererProps> = ({ message }) => {
  const { t } = useTranslation('chatTools');
  const origin = message.origin;
  const body = origin?.body?.trim();
  if (!origin || !body) return null;

  return (
    <div className="group pt-2 pb-4 px-4 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[0.8461rem] text-text-primary/50">
        <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 shrink-0" />
        <span>{t('peerAgentMessage.title')}</span>
        {origin.name && <span className="text-text-tertiary">· {origin.name}</span>}
      </div>
      <div className="min-w-0">
        <MessageBox>
          <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">
            {body}
          </div>
        </MessageBox>
      </div>
    </div>
  );
};
