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
  /**
   * The project tab is open and the project says nothing about this key, so the
   * value the control shows is the one inherited from global settings (or the
   * built-in default when global says nothing either). The row marks it, so a
   * value that was never set here is not read as one the project chose.
   *
   * The mirror of {@link isOverridden}: that one is for the global tab, this one
   * for the project tab. {@link useDisplaySettings} supplies both the value and
   * this flag.
   */
  isInherited?: boolean;
  /**
   * The project tab is open and the project sets this key itself, overriding the
   * global value. Given, it makes the row wear the project-value badge, whose
   * tooltip carries a reset link that runs this. A function rather than a flag
   * because the badge must not offer a way back it does not have. It is the one
   * way back that works for every control, switches and text fields included.
   * {@link useDisplaySettings}'s `resetFor` supplies it.
   */
  onResetToGlobal?: () => void;
  /**
   * Rendered under the whole row, spanning its width.
   *
   * For something that follows from the control rather than describing it — a
   * consequence of the current value, shown only while that value holds. The
   * description above says what the setting does and is always true; this says
   * what is happening now. Full width rather than tucked under the control
   * because a sentence squeezed into the right-hand column wraps to three words
   * a line.
   */
  below?: ReactNode;
  children: ReactNode;
}

export function SettingRow(props: SettingRowProps) {
  const { label, description, badge, isOverridden, isInherited, onResetToGlobal, below, children } = props;
  const { t } = useTranslation('settings');

  return (
    // The divider is subtler than the card's own outline, and the last row does
    // without one: drawn there it lands a hair above the card's bottom edge and
    // reads as a doubled line rather than as a separation.
    <div className="py-4 border-b border-border-subtle last:border-b-0">
    <div className="flex flex-col md:flex-row gap-4 md:gap-0 md:items-center md:justify-between">
      <div className="flex-1 me-4">
        <div className="flex items-center gap-1.5">
          <label className="text-sm text-text-primary">{label}</label>
          {badge}
          {isOverridden && <SettingBadge variant={SettingBadgeVariant.ProjectOverride} />}
          {isInherited && <SettingBadge variant={SettingBadgeVariant.Inherited} />}
          {onResetToGlobal && (
            <SettingBadge
              variant={SettingBadgeVariant.ProjectValue}
              action={{ label: t('badges.projectValueReset'), onClick: onResetToGlobal }}
            />
          )}
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
      {below}
    </div>
  );
}
