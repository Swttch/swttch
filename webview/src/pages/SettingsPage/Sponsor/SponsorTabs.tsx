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
 * cards; only one of them is ever relevant at a time.
 *
 * Styled as pills sitting above the rule rather than tabs attached to it (the
 * shape ScopeTabs uses). Looking different is the point: this strip switches
 * panels within one settings page, while ScopeTabs switches the scope the whole
 * page edits — they are not the same kind of control.
 */
export function SponsorTabs(props: Props) {
  const { active, onChange } = props;
  const { t } = useTranslation('settings');

  return (
    <div className="mt-6 pb-1.5 flex items-center border-b-2 border-border-default" role="tablist">
      {ORDER.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`px-3 py-1.5 text-[0.8461rem] rounded-md font-medium transition-colors ${
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
