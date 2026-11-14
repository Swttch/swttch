import { useCallback, useMemo } from 'react';
import { OptionItem } from '../ApprovalPanel/OptionButton';
import { ApprovalPanel } from '../ApprovalPanel';
import { useChatStreamContext } from '../../../contexts/ChatStreamContext';
import { useSessionContext } from '../../../contexts/SessionContext';
import { InputModeValues } from '../../../types/chatInput';
import type { PendingPlanApproval } from '../../../hooks/usePendingPlanApproval';
import { useTranslation } from '@/i18n';
import { useTranscriptViewMode } from '../message-renderers/transcriptViewMode';
import { DesktopPlanCard } from './DesktopPlanCard';

interface Props {
  pending: PendingPlanApproval;
  onApprove: (controlRequestId: string) => void;
  onDeny: (controlRequestId: string, reason?: string) => void;
}

export function AcceptPlanPanel(props: Props) {
  const { pending, onApprove, onDeny } = props;
  const { stop } = useChatStreamContext();
  const { setInputMode } = useSessionContext();
  const { t } = useTranslation('chat');
  const viewMode = useTranscriptViewMode();

  const options: OptionItem[] = useMemo(() => [
    { key: '1', label: t('acceptPlan.options.autoAccept') },
    { key: '2', label: t('acceptPlan.options.manualApprove') },
    { key: '3', label: t('acceptPlan.options.keepPlanning') },
  ], [t]);

  const handleOptionSelect = useCallback((index: number) => {
    if (index === 0) {
      onApprove(pending.controlRequestId);
      setInputMode(InputModeValues.AUTO_EDIT);
    } else if (index === 1) {
      onApprove(pending.controlRequestId);
      setInputMode(InputModeValues.ASK_BEFORE_EDIT);
    } else if (index === 2) {
      onDeny(pending.controlRequestId);
      stop();
    }
  }, [pending, onApprove, onDeny, setInputMode, stop]);

  const handleTextSubmit = useCallback((text: string) => {
    onDeny(pending.controlRequestId, text);
  }, [pending, onDeny]);

  const handleCancel = useCallback(() => {
    onDeny(pending.controlRequestId);
    stop();
  }, [pending, onDeny, stop]);

  // In the views that follow the desktop app the plan is asked about with its card.
  if (viewMode !== null) return <DesktopPlanCard pending={pending} onApprove={onApprove} onDeny={onDeny} />;

  return (
    <ApprovalPanel
      title={t('acceptPlan.title')}
      subtitle={t('acceptPlan.subtitle')}
      options={options}
      onOptionSelect={handleOptionSelect}
      textareaPlaceholder={t('acceptPlan.textareaPlaceholder')}
      onTextSubmit={handleTextSubmit}
      onCancel={handleCancel}
    />
  );
}
