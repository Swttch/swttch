import toast from 'react-hot-toast';
import { SettingRow, ScopeGuard } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { Tooltip } from '@/components/Tooltip';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useSettings } from '@/contexts/SettingsContext';
import { useNonessentialTraffic } from '@/hooks/queries/useNonessentialTraffic';
import { useTranslation } from '@/i18n';

/**
 * Claude Code's `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, the switch that limits the CLI to
 * the traffic a prompt needs. Here so it can be turned off without a terminal: it also keeps
 * Claude Code from updating itself, and the About screen's auto-update switch points here.
 *
 * Written to the user settings file only, the one the CLI shared by every project reads, so
 * the project tab shows it inert.
 */
export function NonessentialTrafficRow() {
  const { t } = useTranslation('settings');
  const { scope } = useSettings();
  const { state, saving, setDisabled } = useNonessentialTraffic();

  if (!state) return null;

  return (
    <SettingRow
      label={t('general.nonessentialTraffic.label')}
      description={
        <>
          {t('general.nonessentialTraffic.description')}
          <br />
          {t('general.nonessentialTraffic.keys')}
        </>
      }
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/settings#environment-variables"
        />
      }
    >
      <ScopeGuard supportedScope="global" currentScope={scope}>
        <Tooltip content={state.lock ? t('general.nonessentialTraffic.managed', { path: state.lock.path ?? '' }) : undefined}>
          {/* A disabled button receives no pointer events, so the tooltip hangs on a wrapper. */}
          <span className="inline-flex">
            <ToggleSwitch
              checked={state.disabled}
              onChange={(disabled) => {
                setDisabled(disabled).catch((error: Error) => {
                  toast.error(`${t('general.nonessentialTraffic.saveFailed')}: ${error.message}`);
                });
              }}
              disabled={state.lock !== null || saving}
              ariaLabel={t('general.nonessentialTraffic.label')}
            />
          </span>
        </Tooltip>
      </ScopeGuard>
    </SettingRow>
  );
}
