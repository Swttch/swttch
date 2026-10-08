import { useTranslation } from '@/i18n';
import { SideQuestionStatus, type SideQuestionExchange } from '@/contexts/SideQuestionContext';
import { StreamingMessage } from '@/pages/ChatPage/StreamingMessage';

interface Props {
  exchange: SideQuestionExchange;
}

/** One side question and what came back for it. */
export function Exchange(props: Props) {
  const { exchange } = props;
  const { t } = useTranslation('chat');
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-surface-hover px-3 py-2 text-[0.9230rem] text-text-primary whitespace-pre-wrap break-words">
          {exchange.question}
        </div>
      </div>
      {exchange.status === SideQuestionStatus.Pending && (
        <div className="flex items-center gap-2 px-1 text-[0.9230rem] text-text-tertiary">
          <span className="inline-block w-2 h-2 rounded-full bg-text-tertiary animate-pulse" />
          {t('sideQuestion.thinking')}
        </div>
      )}
      {exchange.status === SideQuestionStatus.Answered && exchange.answer && (
        <StreamingMessage
          content={exchange.answer}
          isStreaming={false}
          className="text-text-primary text-[1rem] leading-relaxed"
        />
      )}
      {exchange.status === SideQuestionStatus.Failed && (
        <div className="px-1 text-[0.9230rem] text-state-error-fg whitespace-pre-wrap">
          {exchange.answer ?? t('sideQuestion.failed')}
        </div>
      )}
    </div>
  );
}
