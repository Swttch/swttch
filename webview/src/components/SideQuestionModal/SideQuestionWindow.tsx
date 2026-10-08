import { useEffect, useRef } from 'react';
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import { SideQuestionStatus, type SideQuestionExchange } from '@/contexts/SideQuestionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useVerticalResize } from '@/hooks/useVerticalResize';
import { Exchange } from './Exchange';
import { SideQuestionComposer } from './SideQuestionComposer';

// Same sizing scheme as the agent transcript modal it sits beside: a share of
// the window plus an offset the handle drags.
const DEFAULT_HEIGHT_OFFSET_PX = 60;
const MIN_HEIGHT_OFFSET_PX = -120;
const MAX_HEIGHT_OFFSET_PX = DEFAULT_HEIGHT_OFFSET_PX + 300;

interface Props {
  /** Exchanges of the session on screen, oldest first. */
  exchanges: SideQuestionExchange[];
  onClose: () => void;
  onClear: () => void;
}

export function SideQuestionWindow(props: Props) {
  const { exchanges, onClose, onClear } = props;
  const { t } = useTranslation('chat');
  const { runControlRequestCommand } = useChatStreamContext();
  const { inputMode } = useSessionContext();
  const dialogRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { height: heightOffset, startResize, wasJustResizing } = useVerticalResize({
    initialHeight: DEFAULT_HEIGHT_OFFSET_PX,
    minHeight: MIN_HEIGHT_OFFSET_PX,
    maxHeight: MAX_HEIGHT_OFFSET_PX,
  });

  // Focus trap, as in the agent transcript modal: without it the chat
  // composer's auto-focus pulls the caret back out of this window. The editor
  // gets focus on open so a shortcut press can go straight into typing.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusEditor = () => (editorRef.current ?? dialogRef.current)?.focus();
    focusEditor();
    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) focusEditor();
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Follow the newest exchange, the way the chat follows its newest reply.
  const lastKey = exchanges.length
    ? `${exchanges[exchanges.length - 1].requestId}:${exchanges[exchanges.length - 1].status}`
    : '';
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastKey]);

  const send = (question: string) => runControlRequestCommand(`/btw ${question}`, inputMode);

  const isWaiting = exchanges.some((e) => e.status === SideQuestionStatus.Pending);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (wasJustResizing()) return;
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full max-w-3xl" style={{ height: `calc(50vh + ${heightOffset}px)` }}>
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-label={t('sideQuestion.title')}
            className="h-full bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none"
          >
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 flex-shrink-0 border-b border-border-subtle">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-text-primary truncate">{t('sideQuestion.title')}</h2>
                <div className="text-[0.8461rem] text-text-tertiary">{t('sideQuestion.subtitle')}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {exchanges.length > 0 && (
                  <button
                    onClick={onClear}
                    className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors"
                    title={t('sideQuestion.clear')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors"
                  title={t('sideQuestion.close')}
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
              {exchanges.length === 0 ? (
                <div className="text-text-primary/50 text-[0.9230rem] text-center mt-8">{t('sideQuestion.empty')}</div>
              ) : (
                exchanges.map((exchange) => <Exchange key={exchange.requestId} exchange={exchange} />)
              )}
            </div>

            <div className="shrink-0 px-3 pb-3 pt-1">
              <SideQuestionComposer inputMode={inputMode} onSend={send} editorRef={editorRef} />
              {isWaiting && <span className="sr-only">{t('sideQuestion.thinking')}</span>}
            </div>
          </div>
          {/* Drag handle on the bottom edge, as on the agent transcript modal. */}
          <div
            onPointerDown={startResize}
            className="absolute left-0 right-0 -bottom-1.5 h-3 cursor-ns-resize group flex items-center justify-center"
            title={t('backgroundTasks.transcriptModal.resize')}
          >
            <div className="w-10 h-1 rounded-full bg-border-default group-hover:bg-text-tertiary transition-colors" />
          </div>
        </div>
      </div>
    </Portal>
  );
}
