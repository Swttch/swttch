import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import claudeCodeLogo from '../../assets/claude-code-logo.svg';
import { ClawdWalk } from './ClawdWalk';
import { RunnerGame } from './runner/RunnerGame';
import { APP_NAME } from '@/config/app';
import { useTranslation } from '@/i18n';
import { AnnouncementEmptyStateSlot } from '@/components/Announcements/placements';

export const EmptyState = () => {
  const { t } = useTranslation('chat');
  const isMac = navigator.platform.toUpperCase().includes('MAC');

  const kbdClass = "inline-flex items-center px-1.5 py-0.5 bg-surface-tooltip rounded text-text-secondary text-xs font-mono";

  const hints: ReactNode[] = useMemo(
    () => [
      t('emptyState.hints.todoStart'),
      <>
        {t('emptyState.hints.readyToCodeLine1')}
        <br />
        {t('emptyState.hints.readyToCodeLine2')}
      </>,
      t('emptyState.hints.pickModel'),
      t('emptyState.hints.claudeMdInstructions'),
      t('emptyState.hints.claudeMdRemember'),
      <>
        {t('emptyState.hints.approveEditsPrefix')} <kbd className={kbdClass}>Shift</kbd>{' '}
        <kbd className={kbdClass}>Tab</kbd> {t('emptyState.hints.approveEditsSuffix')}
      </>,
      <>
        {t('emptyState.hints.highlightChatPrefix')}{' '}
        <kbd className={kbdClass}>{isMac ? 'Option' : 'Alt'}</kbd> <kbd className={kbdClass}>K</kbd>{' '}
        {t('emptyState.hints.highlightChatSuffix')}
      </>,
      <>
        {t('emptyState.hints.mcpManagePrefix')} <kbd className={kbdClass}>/mcp</kbd>{' '}
        {t('emptyState.hints.mcpManageSuffix')}
      </>,
      <>
        {t('emptyState.hints.planningModePrefix')} <kbd className={kbdClass}>Shift</kbd>{' '}
        <kbd className={kbdClass}>Tab</kbd> {t('emptyState.hints.planningModeSuffix')}
      </>,
      t('emptyState.hints.pickModel'),
      t('emptyState.hints.rightPlace'),
    ],
    [isMac, t, kbdClass],
  );

  const [hint, setHint] = useState<ReactNode>(t('emptyState.initialHint'));
  /** Clicking Dorongi hands the empty state over to the runner game. */
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const index = Math.floor(Math.random() * hints.length);
    setHint(hints[index]);
  }, [hints]);

  return (
    <div className="h-full flex flex-col">
      <div className="pt-4 flex justify-center">
        <img src={claudeCodeLogo} alt={APP_NAME} width={120} />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 pt-14">
        {playing ? (
          <RunnerGame onExit={() => setPlaying(false)} />
        ) : (
          <>
            <ClawdWalk onDorongiClick={() => setPlaying(true)} />
            <p className="text-text-secondary text-[1rem] text-center max-w-[18rem] leading-[1.7]">{hint}</p>
            <AnnouncementEmptyStateSlot />
          </>
        )}
      </div>
    </div>
  );
};
