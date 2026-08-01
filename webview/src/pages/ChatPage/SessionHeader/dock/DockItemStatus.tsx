import type { ComponentType } from 'react';
import { useTranslation } from '@/i18n';
import { useUsageData } from '@/pages/SettingsPage/Usage/useUsageData';
import { useScheduledMessages } from '@/contexts/ScheduledMessagesContext';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { useTunnelStatus } from '@/hooks';
import { DockItemId } from '@/types/settings';
import { BatteryVisual } from '../BatteryVisual';

interface IconProps {
  icon: ComponentType<{ className?: string }>;
}

interface RowProps extends IconProps {
  /** i18n key for the item's label — the same one its dock icon's title uses. */
  labelKey: string;
}

/**
 * Renders one dock item's icon (colored the same way its dock icon is) plus,
 * on the right, the same live value the dock icon shows — so the ⋮ menu row
 * reads like a preview of the dock icon rather than a second, disconnected
 * source of truth.
 *
 * Every item is rendered here regardless of its own visibility (the menu
 * always lists all six), so each branch below can call its own hooks
 * unconditionally — the same pattern the dock icons themselves already use.
 */
export function DockItemStatus(props: { id: DockItemId } & RowProps) {
  const { id, icon, labelKey } = props;
  switch (id) {
    case DockItemId.TOKEN_BATTERY:
      return <TokenBatteryRow icon={icon} labelKey={labelKey} />;
    case DockItemId.SCHEDULED_MESSAGES:
      return (
        <PanelCountRow
          icon={icon}
          labelKey={labelKey}
          count={useScheduledMessages().reservations.length}
          active={false}
        />
      );
    case DockItemId.BACKGROUND_TASKS: {
      const running = useWorkflowState().runningTasks.length;
      return <PanelCountRow icon={icon} labelKey={labelKey} count={running} active={running > 0} />;
    }
    case DockItemId.TUNNEL:
      return <TunnelRow icon={icon} labelKey={labelKey} />;
    default:
      // Settings and New Tab are one-shot actions with nothing to report.
      return <PlainRow icon={icon} labelKey={labelKey} />;
  }
}

function PlainRow(props: RowProps) {
  const { t } = useTranslation('chat');
  return (
    <>
      <Icon icon={props.icon} />
      <span className="flex-1 min-w-0 truncate text-[0.8461rem] text-text-primary">{t(props.labelKey)}</span>
    </>
  );
}

function Icon(props: IconProps & { className?: string }) {
  const Component = props.icon;
  return <Component className={`w-4 h-4 shrink-0 ${props.className ?? 'text-text-secondary'}`} />;
}

function TokenBatteryRow(props: RowProps) {
  const { t } = useTranslation('chat');
  const { data, isLoading, errorKind } = useUsageData();
  const label = (
    <span className="flex-1 min-w-0 truncate text-[0.8461rem] text-text-primary">{t(props.labelKey)}</span>
  );

  if (errorKind === 'ccb_missing') {
    return (
      <>
        <Icon icon={props.icon} />
        {label}
        <span className="text-[0.7692rem] text-text-tertiary">{t('sessionHeader.tokenBattery.setupLabel')}</span>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <Icon icon={props.icon} />
        {label}
      </>
    );
  }

  const remaining = 100 - (data.five_hour?.utilization ?? 0);
  return (
    <>
      <Icon icon={props.icon} />
      {label}
      <BatteryVisual remaining={remaining} isLoading={isLoading} />
    </>
  );
}

function PanelCountRow(props: RowProps & { count: number; active: boolean }) {
  const { t } = useTranslation('chat');
  return (
    <>
      <Icon icon={props.icon} className={props.active ? 'text-text-link' : undefined} />
      <span className="flex-1 min-w-0 truncate text-[0.8461rem] text-text-primary">{t(props.labelKey)}</span>
      {/* Hidden at zero — an empty badge would say nothing a bare icon doesn't. */}
      {props.count > 0 && (
        <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-text-link text-text-inverse text-[0.7077rem] font-semibold leading-5 text-center">
          {props.count}
        </span>
      )}
    </>
  );
}

function TunnelRow(props: RowProps) {
  const { t } = useTranslation('chat');
  const { tunnelEnabled } = useTunnelStatus();
  return (
    <>
      <Icon icon={props.icon} className={tunnelEnabled ? 'text-state-success-fg' : undefined} />
      <span className="flex-1 min-w-0 truncate text-[0.8461rem] text-text-primary">{t(props.labelKey)}</span>
      {tunnelEnabled && (
        <span className="text-[0.7692rem] font-medium text-state-success-fg">{t('sessionHeader.dock.active')}</span>
      )}
    </>
  );
}
