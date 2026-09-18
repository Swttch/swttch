import { SettingRow, ShortcutInput } from '../../common';
import { Select, type SelectOption } from '@/components/Select';

interface Props {
  label: string;
  description: string;
  options: SelectOption[];
  /** The mode the dropdown is on, already resolved — never null. */
  mode: string;
  onModeChange: (mode: string) => void;
  /** True when `mode` is the custom one, which is what reveals the recorder. */
  isCustom: boolean;
  /** The recorded combination in stored form, empty until one is recorded. */
  custom: string;
  onCustomChange: (shortcut: string) => void;
  /** Shown under the row when the chosen combination cannot be accepted. */
  error?: string;
  isOverridden?: boolean;
}

/**
 * One composer key: a dropdown of named modes, plus a recorder when the mode is
 * "custom".
 *
 * Send and newline are the same control with different words, so they are the
 * same component. Writing the two out separately is how they drift — one grows
 * a conflict message or a disabled state and the other does not.
 *
 * The recorder sits to the left of the dropdown rather than below it: the row
 * reads as one control that way, and the dropdown stays in the column every
 * other setting's control is in.
 */
export function ShortcutChoiceRow(props: Props) {
  const {
    label,
    description,
    options,
    mode,
    onModeChange,
    isCustom,
    custom,
    onCustomChange,
    error,
    isOverridden,
  } = props;

  return (
    <SettingRow label={label} description={description} isOverridden={isOverridden}>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {isCustom && (
            <ShortcutInput
              value={custom}
              onChange={onCustomChange}
              ariaLabel={label}
              allowShiftAlone
            />
          )}
          <Select
            value={mode}
            options={options}
            ariaLabel={label}
            onChange={onModeChange}
            className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
        </div>
        {error && <span className="text-xs text-state-error-fg">{error}</span>}
      </div>
    </SettingRow>
  );
}
