import type { ReactNode } from 'react';
import { SettingDescription } from './SettingDescription';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useTranslation } from '@/i18n';

interface SettingRowProps {
  label: string;
  /**
   * ReactNode rather than string so a row can end its description with an
   * inline affordance — e.g. the ⓘ that explains where voice input departs
   * from the CLI. Plain strings still work unchanged.
   */
  description?: ReactNode;
  /** Optional badge(s) shown to the right of the label (e.g. sponsor / native). */
  badge?: ReactNode;
  /**
   * The project sets this key too, so the global value on screen is not the one
   * in effect. The row then says so and stops accepting edits, because a global
   * change the project overrides looks applied and is not (issue #344).
   *
   * Passed in rather than looked up here: this stays a presentational component,
   * and the sections handing it down already hold the settings context.
   * {@link useIsOverriddenByProject} computes it.
   */
  isOverridden?: boolean;
  children: ReactNode;
}

export function SettingRow(props: SettingRowProps) {
  const { label, description, badge, isOverridden, children } = props;
  const { t } = useTranslation('settings');

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-0 md:items-center md:justify-between py-3 border-b border-border-default">
      <div className="flex-1 me-4">
        <div className="flex items-center gap-1.5">
          <label className="text-sm text-text-primary">{label}</label>
          {badge}
          {isOverridden && <SettingBadge variant={SettingBadgeVariant.ProjectOverride} />}
        </div>
        {description && <SettingDescription>{description}</SettingDescription>}
      </div>
      <div className="flex-shrink-0">
        {isOverridden ? (
          // Dimmed and inert rather than hidden: the setting still exists and the
          // user should see what it is set to globally, just not be able to edit a
          // value the project would keep overriding. `title` carries the reason to
          // pointer users; the badge beside the label carries it to everyone else.
          <div className="cursor-not-allowed" title={t('badges.projectOverride')}>
            <div className="opacity-40 pointer-events-none select-none" aria-disabled>
              {children}
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
