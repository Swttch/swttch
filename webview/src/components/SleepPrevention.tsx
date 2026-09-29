import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useTranslation } from '@/i18n';
import type { SleepExternalChange } from '@/hooks/useTunnelStatus';

/**
 * The sleep prevention setting, shared by every place that shows it (the remote
 * tunnel modal and the Settings page). Its wording, its switch rule and its hint
 * live here once, so the two places cannot drift into two different features.
 */

/** The switch's label and one-line description, from the single set of strings. */
export function useSleepPreventionCopy(): { label: string; description: string } {
  const { t } = useTranslation('common');
  return {
    label: t('tunnelModal.preventSleep'),
    description: t('tunnelModal.keepAwake'),
  };
}

interface SwitchProps {
  checked: boolean;
  /** True while this switch's own request is in flight. */
  loading: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Independent of the tunnel: reachable whether the tunnel is on or off. The one
 * legitimate reason to hold it is its own pending call, so a double click cannot
 * race two opposite requests against each other.
 */
export function SleepPreventionSwitch(props: SwitchProps) {
  const { checked, loading, onChange } = props;
  return <ToggleSwitch checked={checked} onChange={onChange} disabled={loading} />;
}

/** What the user needs to know about the limits, shown while the switch is on. */
export function SleepPreventionHint(props: { externalChange?: SleepExternalChange }) {
  const { externalChange = 'none' } = props;
  const { t } = useTranslation('common');
  return (
    <>
    <ul className="mt-3 space-y-1.5 rounded-md bg-surface-pressed/40 px-3 py-2.5 text-xs text-text-secondary">
      {([1, 2, 3, 4] as const).map((n) => (
        <li key={n} className="flex gap-2">
          <span aria-hidden className="text-sm leading-none text-accent-primary">•</span>
          <span>
            <strong className="font-semibold text-text-primary">
              {t(`tunnelModal.sleepGuardHint${n}Lead`)}
            </strong>{' '}
            {t(`tunnelModal.sleepGuardHint${n}Rest`)}
          </span>
        </li>
      ))}
    </ul>
    {externalChange !== 'none' && (
      <p role="status" className="mt-2 rounded-md border border-border-default px-3 py-2 text-xs text-text-primary">
        {externalChange === 'scheme' ? t('tunnelModal.sleepGuardChangedScheme') : t('tunnelModal.sleepGuardChangedSetting')}
      </p>
    )}
    </>
  );
}
