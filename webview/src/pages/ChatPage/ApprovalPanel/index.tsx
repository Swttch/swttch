import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { OptionButton, OptionItem } from './OptionButton';
import { useApprovalKeyboard } from './useApprovalKeyboard';
import {
  CollapseToggle,
  CollapsedSummaryBar,
  EscToCancelHint,
  useCollapsiblePanel,
} from '../PromptPanelChrome';
import { useTranslation } from '@/i18n';

interface Props {
  /**
   * The heading. A node rather than a string because the permission prompt
   * makes its file name a link to the review diff; [collapsedTitle] carries the
   * plain wording for the collapsed bar, which is a single button.
   */
  title: ReactNode;
  /** Plain-text heading for the collapsed bar. Defaults to [title]. */
  collapsedTitle?: string;
  subtitle?: string;
  /** Optional highlighted note shown under the title (e.g. a usage warning). */
  notice?: string;
  /**
   * Optional content between the heading and the options — what the question
   * is about, shown where it is read before answering. Used by the permission
   * prompt for the review diff on hosts that cannot open one in an IDE.
   */
  preview?: ReactNode;
  options: OptionItem[];
  onOptionSelect: (index: number) => void;
  textareaPlaceholder?: string;
  onTextSubmit?: (text: string) => void;
  onCancel: () => void;
}

export function ApprovalPanel(props: Props) {
  const { t } = useTranslation('chat');
  const { title, collapsedTitle, subtitle, notice, preview, options, onOptionSelect, textareaPlaceholder = t('approvalPanel.defaultTextareaPlaceholder'), onTextSubmit, onCancel } = props;

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { collapsed, toggle: toggleCollapsed, expand } = useCollapsiblePanel();

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    autoResize();
  }, [feedbackText, autoResize]);

  const handleOptionClick = useCallback((index: number) => {
    setFocusedIndex(index);
    onOptionSelect(index);
  }, [onOptionSelect]);

  const handleTextSubmit = useCallback(() => {
    const text = feedbackText.trim();
    if (text && onTextSubmit) {
      onTextSubmit(text);
      setFeedbackText('');
    }
  }, [feedbackText, onTextSubmit]);

  const { handleInputKeyDown } = useApprovalKeyboard({
    optionCount: options.length,
    focusedIndex,
    setFocusedIndex,
    handleOptionClick,
    handleTextSubmit,
    onCancel,
    selectionDisabled: collapsed,
  });

  useEffect(() => {
    if (collapsed) return;
    if (focusedIndex === options.length) textareaRef.current?.focus();
  }, [collapsed, focusedIndex, options.length]);

  if (collapsed) {
    return (
      <div className="w-full max-w-[44rem] mx-auto px-4 pb-[20px] pt-2">
        <CollapsedSummaryBar title={collapsedTitle ?? (typeof title === 'string' ? title : '')} onExpand={expand} />
      </div>
    );
  }

  return (
    <div className="max-w-[44rem] mx-auto px-4 pb-[20px] pt-2">
      <div className="rounded-lg border border-border-default bg-surface-raised overflow-hidden">
        {/* 헤더 */}
        <div className="px-2 py-2.5 mb-0.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[1.0769rem] font-semibold text-text-primary leading-snug">{title}</p>
            {subtitle && (
              <p className="text-[1rem] text-text-secondary mt-1">{subtitle}</p>
            )}
            {notice && (
              <p className="text-[0.9230rem] text-text-secondary mt-2 px-2.5 py-2 rounded-[4px] bg-surface-hover border border-border-subtle">
                {notice}
              </p>
            )}
          </div>
          <CollapseToggle collapsed={false} onToggle={toggleCollapsed} />
        </div>

        {preview && <div className="px-2 pb-2">{preview}</div>}

        {/* 옵션 목록 */}
        <div className="px-2 flex flex-col gap-[7px]">
          {options.map((opt, idx) => (
            <OptionButton
              key={opt.key}
              option={opt}
              isFocused={focusedIndex === idx}
              onClick={() => handleOptionClick(idx)}
              onFocus={() => setFocusedIndex(idx)}
            />
          ))}

          {/* 자유 텍스트 입력 */}
          {onTextSubmit && (
            <textarea
              ref={textareaRef}
              value={feedbackText}
              rows={1}
              tabIndex={0}
              onFocus={() => setFocusedIndex(options.length)}
              onChange={e => setFeedbackText(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={textareaPlaceholder}
              className="w-full bg-transparent text-[1rem] px-2.5 py-[5px] text-text-primary placeholder-text-tertiary focus:outline-none border border-border-strong/20 rounded-[4px] text-start font-normal transition-colors duration-100 resize-none overflow-hidden"
            />
          )}
        </div>

        {/* 푸터 */}
        <div className="px-2 pb-2 pt-0.5">
          <EscToCancelHint
            label={t('approvalPanel.escToCancel')}
            onCancel={onCancel}
            className="text-[0.8461rem] text-text-secondary"
          />
        </div>
      </div>
    </div>
  );
}
