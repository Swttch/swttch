import toast from 'react-hot-toast';
import { SettingRow } from '../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { Tooltip } from '@/components/Tooltip';
import { Select, type SelectOption } from '@/components/Select';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { CliAutoUpdateLockKind, CliUpdateChannel, type CliAutoUpdateLock } from '@/shared';
import { useCliAutoUpdate } from '@/hooks/queries/useCliAutoUpdate';
import { useTranslation } from '@/i18n';

const NONESSENTIAL_TRAFFIC_VARIABLE = 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC';

const LOCK_KEY: Record<CliAutoUpdateLockKind, string> = {
  [CliAutoUpdateLockKind.ENVIRONMENT]: 'about.cliAutoUpdate.lock.environment',
  [CliAutoUpdateLockKind.USER_SETTINGS]: 'about.cliAutoUpdate.lock.userSettings',
  [CliAutoUpdateLockKind.MANAGED_SETTINGS]: 'about.cliAutoUpdate.lock.managedSettings',
  [CliAutoUpdateLockKind.GLOBAL_CONFIG]: 'about.cliAutoUpdate.lock.globalConfig',
};

/**
 * Claude Code's own auto-update settings: `DISABLE_AUTOUPDATER` and `autoUpdatesChannel` in
 * the user settings file.
 *
 * The same settings a terminal user edits by hand, so they govern `claude` in the terminal as
 * well as the plugin's background update. When something the switch does not own keeps
 * auto-updates off, the switch is shown off and inert, and its tooltip names that place.
 */
export function CliAutoUpdateRow() {
  const { t } = useTranslation('settings');
  const { state, saving, setEnabled, setChannel } = useCliAutoUpdate();

  if (!state) return null;

  // Anything but managed settings can lift CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC from the
  // Privacy screen, so the tooltip sends the user there rather than to a terminal.
  const lockText = (lock: CliAutoUpdateLock) =>
    lock.variable === NONESSENTIAL_TRAFFIC_VARIABLE && lock.kind !== CliAutoUpdateLockKind.MANAGED_SETTINGS
      ? t('about.cliAutoUpdate.lock.nonessentialTraffic')
      : t(LOCK_KEY[lock.kind], { variable: lock.variable ?? '', path: lock.path ?? '' });

  const reportFailure = (error: Error) => {
    toast.error(`${t('about.cliAutoUpdate.saveFailed')}: ${error.message}`);
  };

  // RC is a value the CLI accepts but does not describe; it is listed only once it is set.
  const channels = [CliUpdateChannel.LATEST, CliUpdateChannel.STABLE];
  if (state.channel === CliUpdateChannel.RC) channels.push(CliUpdateChannel.RC);
  const channelOptions: SelectOption[] = channels.map((channel) => ({
    value: channel,
    label: t(`about.cliUpdate.channel.${channel}`),
  }));

  return (
    <SettingRow
      label={t('about.cliAutoUpdate.label')}
      description={
        <>
          {t('about.cliAutoUpdate.description')}
          <br />
          {t('about.cliAutoUpdate.keys')}
        </>
      }
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/settings#available-settings"
        />
      }
    >
      <div className="flex items-center gap-3">
        <Tooltip content={state.lock ? lockText(state.lock) : undefined}>
          {/* A disabled button receives no pointer events, so the tooltip hangs on a wrapper. */}
          <span className="inline-flex">
            <ToggleSwitch
              checked={state.enabled}
              onChange={(enabled) => { setEnabled(enabled).catch(reportFailure); }}
              disabled={state.lock !== null || saving}
              ariaLabel={t('about.cliAutoUpdate.label')}
            />
          </span>
        </Tooltip>
        {/* The channel only says where auto-updates go, so it is inert while they are off. */}
        <Select
          value={state.channel}
          options={channelOptions}
          disabled={!state.enabled || saving}
          ariaLabel={t('about.cliAutoUpdate.channelLabel')}
          onChange={(value) => { setChannel(value as CliUpdateChannel).catch(reportFailure); }}
          className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        />
      </div>
    </SettingRow>
  );
}
