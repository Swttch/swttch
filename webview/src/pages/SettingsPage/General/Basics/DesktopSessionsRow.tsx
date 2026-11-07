import { useState } from 'react';
import { api } from '@/api/ClaudeCodeApi';
import type { SessionsEntrypointUpdate } from '@/api/modules/SessionsApi';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { useTranslation } from '@/i18n';
import { SettingRow } from '../../common';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; result: SessionsEntrypointUpdate }
  | { kind: 'error'; message: string };

/**
 * Makes the sessions this folder had before the entrypoint was named visible to Claude Desktop's own
 * "Import Claude Code CLI sessions" (#647).
 *
 * An action, not a setting: there is nothing to persist. Sessions started from now on need nothing, since they are
 * started under a name the import accepts; this is for the ones that already exist. The row does not import them,
 * because the import is Desktop's own menu entry and the result text says where it is.
 */
export function DesktopSessionsRow() {
  const { t } = useTranslation('settings');
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory;
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  const run = async () => {
    setOutcome({ kind: 'busy' });
    try {
      setOutcome({ kind: 'done', result: await api.sessions.updateEntrypoint(workingDirectory ?? undefined) });
    } catch (err) {
      setOutcome({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <SettingRow
      label={t('general.desktopSessions.label')}
      description={t('general.desktopSessions.description')}
      below={<OutcomeText outcome={outcome} folder={workingDirectory ?? ''} />}
    >
      <button
        type="button"
        aria-label={t('general.desktopSessions.label')}
        disabled={outcome.kind === 'busy'}
        onClick={() => void run()}
        className="rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-overlay"
      >
        {outcome.kind === 'busy' ? t('general.desktopSessions.busy') : t('general.desktopSessions.action')}
      </button>
    </SettingRow>
  );
}

/** [folder] is named in the "nothing to prepare" answer, so a press in the wrong folder is seen for what it is. */
function OutcomeText({ outcome, folder }: { outcome: Outcome; folder: string }) {
  const { t } = useTranslation('settings');
  if (outcome.kind === 'idle' || outcome.kind === 'busy') return null;
  if (outcome.kind === 'error') {
    return <p className="text-sm text-red-500">{t('general.desktopSessions.error', { message: outcome.message })}</p>;
  }

  const { updated, running, changedMeanwhile, failed } = outcome.result;
  const left = running.length + changedMeanwhile.length;
  return (
    <div className="space-y-1 text-sm text-text-secondary">
      {updated.length > 0 ? (
        <>
          <p>{t('general.desktopSessions.done', { count: updated.length })}</p>
          <p>{t('general.desktopSessions.next')}</p>
        </>
      ) : (
        <p>{t('general.desktopSessions.none', { folder })}</p>
      )}
      {left > 0 && <p>{t('general.desktopSessions.left', { count: left })}</p>}
      {failed.length > 0 && <p>{t('general.desktopSessions.failed', { count: failed.length })}</p>}
    </div>
  );
}
