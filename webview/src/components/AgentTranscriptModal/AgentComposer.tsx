import { useState } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

interface Props {
  /** The agent's address. */
  agentId: string;
  onSend: (agentId: string, message: string) => void;
}

/**
 * Say something to a background agent, from the view of that agent.
 *
 * The conversation belongs here rather than in the main chat: the message is
 * addressed to this agent, and the reply comes back in this transcript. What
 * actually happens is that the model is asked to pass it on with SendMessage
 * (see useSendToAgent) — the CLI offers its own user no more direct route than
 * that either.
 *
 * Sending is one-way as far as this component is concerned. Nothing is echoed
 * locally, because the CLI records the message itself: resuming an agent fires a
 * fresh `task_started` carrying this text as its `prompt`, and that is where the
 * transcript above picks it up from. A local echo would be a second copy that
 * could disagree with the first, and it would appear whether or not the message
 * was ever delivered.
 */
export function AgentComposer(props: Props) {
  const { agentId, onSend } = props;
  const { t } = useTranslation('chat');
  const [text, setText] = useState('');

  const send = () => {
    const message = text.trim();
    if (!message) return;
    onSend(agentId, message);
    setText('');
  };

  return (
    <div className="shrink-0 border-t border-border-subtle p-2">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — the same bargain the
            // main composer strikes.
            if (e.key !== 'Enter' || e.shiftKey) return;
            e.preventDefault();
            send();
          }}
          rows={1}
          placeholder={t('backgroundTasks.agentComposer.placeholder')}
          className="min-h-[2rem] max-h-24 flex-1 resize-none rounded-md border border-border-default bg-surface-base px-2 py-1.5 text-[0.8461rem] text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          title={t('backgroundTasks.agentComposer.send')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
