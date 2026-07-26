import { useEffect } from 'react';
import { StaticItem } from '../../types';
import { i18n } from '@/i18n';
import { enKeyword } from '../../enKeyword';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { useSessionContext } from '@/contexts/SessionContext';
import { useAutoResumeOverride } from '@/contexts/AutoResumeOverrideContext';
import { useSponsorStatus } from '@/hooks/queries/useSponsorStatus';
import { ToggleSwitch } from '@/components/ToggleSwitch';

export const AUTO_RESUME_TOGGLE_EVENT = 'auto-resume-toggle';

/**
 * Reason shown as a hover tooltip when the row is disabled (auto-resume is a
 * sponsor-only feature). A function so the lookup runs on the current locale at
 * call time, not at module load.
 */
export const getAutoResumeSponsorOnlyReason = (): string =>
  i18n.t('commandPalette:model.autoResumeSponsorOnlyReason');

/**
 * Model-section toggle for auto-resume, placed right below "Toggle fast mode".
 * Unlike fast mode (a global native Claude setting), this flips the SESSION-LOCAL
 * override: the app setting `autoResumeOnLimit` is the default that seeds every
 * session, and this toggle changes just the current session on top of it —
 * mirroring how Cursor's extension handles thinking/fast mode (global default +
 * per-session override). Sponsor-only; disabled without an active session.
 */
export const createToggleAutoResumeItem = (): StaticItem =>
  new StaticItem('toggle-auto-resume', i18n.t('commandPalette:model.toggleAutoResume'), {
    keywords: [enKeyword('commandPalette:model.toggleAutoResume'), 'auto resume', 'auto-resume', 'limit'],
    disabled: false,
    keepOpen: true,
    valueComponent: () => <AutoResumeToggle />,
    action: async () => {
      window.dispatchEvent(new CustomEvent(AUTO_RESUME_TOGGLE_EVENT));
    },
  });

const AutoResumeToggle = () => {
  const { settings } = useSettings();
  const { isSponsor } = useSponsorStatus();
  const { currentSessionId } = useSessionContext();
  const { getOverride, setOverride } = useAutoResumeOverride();

  // Effective = session override ?? global default. The toggle writes the
  // session override, never the global setting.
  const globalDefault = settings[SettingKey.AUTO_RESUME_ON_LIMIT] ?? false;
  const enabled = getOverride(currentSessionId) ?? globalDefault;

  const apply = (value: boolean): void => {
    if (!isSponsor || !currentSessionId) return;
    setOverride(currentSessionId, value);
  };

  // Row (Enter/click) toggles the session override — only for sponsors.
  useEffect(() => {
    const handler = () => apply(!enabled);
    window.addEventListener(AUTO_RESUME_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(AUTO_RESUME_TOGGLE_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isSponsor, currentSessionId, setOverride]);

  return (
    <ToggleSwitch
      checked={enabled}
      onChange={(value) => apply(value)}
      disabled={!isSponsor || !currentSessionId}
      size="small"
    />
  );
};
