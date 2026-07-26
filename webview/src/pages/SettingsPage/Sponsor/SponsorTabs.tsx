import { useTranslation } from '@/i18n';

/** Which panel of the sponsor account screen is showing. */
export enum SponsorTab {
  BENEFITS = 'benefits',
  DEVICES = 'devices',
  BILLING = 'billing',
}

interface Props {
  active: SponsorTab;
  onChange: (tab: SponsorTab) => void;
}

const ORDER: SponsorTab[] = [SponsorTab.BENEFITS, SponsorTab.DEVICES, SponsorTab.BILLING];

/**
 * Tabs for the sponsor account screen.
 *
 * Stacking every section vertically made the page a long scroll of low-density
 * cards; only one of them is ever relevant at a time. Styling follows
 * {@link ScopeTabs} so the two tab strips in Settings look like the same control.
 */
export function SponsorTabs(props: Props) {
  const { active, onChange } = props;
  const { t } = useTranslation('settings');

  return (
    <div className="mt-6 flex items-center border-b border-border-default" role="tablist">
      {ORDER.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`px-3 py-2 text-[0.8461rem] rounded-t-md font-medium transition-colors ${
            active === tab
              ? 'text-text-primary bg-surface-tooltip/50'
              : 'text-text-disabled hover:text-text-secondary'
          }`}
        >
          {t(`sponsor.tabs.${tab}`)}
        </button>
      ))}
    </div>
  );
}
