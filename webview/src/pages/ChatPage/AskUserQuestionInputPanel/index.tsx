import { useCallback, useEffect, useRef, KeyboardEvent } from 'react';
import { PendingAskUserQuestion } from '@/hooks/usePendingAskUserQuestion';
import { useApi } from '@/contexts/ApiContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { isMobile } from '@/config/environment';
import { useFormState } from './useFormState';
import { TabBar } from './TabBar';
import { OptionList } from './OptionList';
import { Footer } from './Footer';
import {
  CollapseToggle,
  CollapsedSummaryBar,
  useCollapsiblePanel,
} from '../PromptPanelChrome';

interface Props {
  toolUse: PendingAskUserQuestion['toolUse'];
  controlRequestId?: string;
  onDismiss: () => void;
}

export const AskUserQuestionInputPanel = (props: Props) => {
  const { toolUse, controlRequestId, onDismiss } = props;
  const api = useApi();
  const { stop } = useChatStreamContext();
  const panelRef = useRef<HTMLDivElement>(null);

  const questions = toolUse.input.questions;

  const form = useFormState(questions);
  const { collapsed, toggle: toggleCollapsed, expand } = useCollapsiblePanel();

  const questionText = form.currentQuestion.header
    ? form.currentQuestion.question
    : undefined;

  const handleCancel = useCallback(() => {
    if (controlRequestId) {
      api.tools.deny(toolUse.id, controlRequestId);
    }
    stop();
    onDismiss();
  }, [toolUse.id, controlRequestId, api, onDismiss, stop]);

  // Esc: deny (capture phase)
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [handleCancel]);

  // Auto-focus panel on mount
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const result = form.submitCurrent();
    if (result !== null) {
      if (controlRequestId) {
        // control_request가 수신된 경우: control_response로 응답
        api.tools.respond(toolUse.id, result, {
          controlRequestId,
          updatedInput: {
            questions: toolUse.input.questions,
            answers: form.buildAnswersRecord(),
          },
        });
      } else {
        // control_request 미수신 (fallback): 기존 tool_result 방식
        api.tools.respond(toolUse.id, result);
      }
      onDismiss();
    }
  };

  const handleOtherKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isMobile()) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const summaryTitle = form.currentQuestion.header || form.currentQuestion.question;

  if (collapsed) {
    return (
      <div className="w-full max-w-[44rem] mx-auto px-4 pb-[14px] pt-2">
        <CollapsedSummaryBar title={summaryTitle} onExpand={expand} />
      </div>
    );
  }

  /*
   * The panel takes no more height than the chat footer gives it (see
   * CHAT_FOOTER_ID in ChatPage). The tab bar with the collapse button and the
   * footer keep their size; only the question and its options between them
   * shrink, and scroll when they no longer fit.
   */
  return (
    <div className="w-full max-w-[44rem] mx-auto px-4 pb-[14px] pt-2 min-h-0 flex flex-col">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative rounded-lg border bg-surface-raised border-border-default outline-none min-h-0 flex flex-col"
      >
        {/* Tab bar */}
        <div className="px-3 pt-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TabBar
                questions={questions}
                currentIndex={form.currentIndex}
                onTabClick={form.setCurrentIndex}
              />
            </div>
            <CollapseToggle collapsed={false} onToggle={toggleCollapsed} />
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {questionText && (
            <div className="px-3 pt-4">
              <p className="text-text-primary text-[1rem]">{questionText}</p>
            </div>
          )}

          {/* Options */}
          <OptionList
            options={form.allOptionsFor(form.currentIndex)}
            selected={form.currentField?.selected ?? []}
            multiSelect={form.currentQuestion.multiSelect}
            isOtherSelected={form.isOtherSelected(form.currentIndex)}
            otherText={form.currentField?.otherText ?? ''}
            onSelect={(label) => form.selectOption(form.currentIndex, label, form.currentQuestion.multiSelect)}
            onOtherTextChange={(text) => form.setOtherText(form.currentIndex, text)}
            onOtherKeyDown={handleOtherKeyDown}
          />
        </div>

        {/* Footer */}
        <Footer
          showSubmitButton={form.showSubmitButton}
          canSubmit={form.canSubmitCurrent}
          isLastTab={form.isLastTab}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
};
