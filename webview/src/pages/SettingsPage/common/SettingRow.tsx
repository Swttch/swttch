import type { ReactNode } from 'react';
import { SettingDescription } from './SettingDescription';

interface SettingRowProps {
  label: string;
  description?: string;
  /** Optional badge(s) shown to the right of the label (e.g. sponsor / native). */
  badge?: ReactNode;
  children: ReactNode;
}

export function SettingRow(props: SettingRowProps) {
  const { label, description, badge, children } = props;
  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-0 md:items-center md:justify-between py-3 border-b border-border-default">
      <div className="flex-1 me-4">
        <div className="flex items-center gap-1.5">
          <label className="text-sm text-text-primary">{label}</label>
          {badge}
        </div>
        {description && <SettingDescription>{description}</SettingDescription>}
      </div>
      <div className="flex-shrink-0">
        {children}
      </div>
    </div>
  );
}
