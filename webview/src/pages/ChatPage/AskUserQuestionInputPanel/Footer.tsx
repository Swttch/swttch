import { useTranslation } from '@/i18n';
import { EscToCancelHint } from '../PromptPanelChrome';

interface Props {
  showSubmitButton: boolean;
  canSubmit: boolean;
  isLastTab: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export const Footer = (props: Props) => {
  const { showSubmitButton, canSubmit, isLastTab, onSubmit, onCancel } = props;
  const { t } = useTranslation('chat');

  return (
    <div className="border-t border-border-default/50 px-3 py-2 flex items-center justify-between">
      <EscToCancelHint
        label={t('askUserQuestion.escToCancel')}
        onCancel={onCancel}
        className="text-text-disabled text-xs"
      />

      {showSubmitButton && (
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="px-3 py-1 rounded text-xs bg-accent-primary-hover text-text-primary hover:bg-accent-primary-pressed disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isLastTab ? t('askUserQuestion.submit') : t('askUserQuestion.next')}
        </button>
      )}
    </div>
  );
};
