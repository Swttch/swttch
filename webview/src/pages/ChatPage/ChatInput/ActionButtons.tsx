import { InputMode, INPUT_MODES } from '../../../types/chatInput';
import { useTranslation } from '@/i18n';

interface Props {
  mode: InputMode;
  isActive: boolean;
  disabled: boolean;
  hasValue: boolean;
  onSubmit: () => void;
  onStop?: () => void;
}

export function ActionButtons(props: Props) {
  const {
    mode,
    isActive,
    disabled,
    hasValue,
    onSubmit,
    onStop,
  } = props;
  const { t } = useTranslation('chat');
  const config = INPUT_MODES[mode];

  return (
    <div className="flex items-center gap-1.5 pb-[1px]">
      {/* 전송/정지 버튼 */}
      {isActive && !hasValue && onStop ? (
        <button
          type="button"
          onClick={onStop}
          className={`flex items-center justify-center w-[26px] h-[26px] rounded-md ${config.sendButtonBg} text-text-inverse transition-colors`}
          title={t('chatInput.actionButtons.stopGenerating')}
        >
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
            <rect x="4" y="4" width="8" height="8" rx="1" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !hasValue}
          className={`
            flex items-center justify-center w-[26px] h-[26px] rounded-md transition-all
            ${config.sendButtonBg} text-text-inverse
            ${disabled || !hasValue
              ? 'opacity-40 cursor-not-allowed'
              : 'opacity-100'
            }
          `}
          title={t('chatInput.actionButtons.sendMessage')}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
