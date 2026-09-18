import type { ReactNode } from 'react';

export interface SegmentedControlOption<T extends string> {
  value: T;
  /**
   * What the segment reads as. A node rather than a string so a caller can swap
   * a long label for a short one at a breakpoint, which is a decision belonging
   * to the screen rather than to this control.
   */
  label: ReactNode;
  /** Blocks the segment, for a choice that cannot be made in the current state. */
  disabled?: boolean;
  /** Shown on hover over a disabled segment, to say why it cannot be chosen. */
  disabledReason?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Names the choice for assistive technology. The group carries no visible
   * heading, so without this the segments are announced with nothing to say what
   * they are a choice between.
   */
  label: string;
}

/**
 * A small set of mutually-exclusive options, all visible at once, switched in a
 * single click with no menu to open first.
 *
 * Use it over a dropdown when there are two or three options and the choice is
 * worth keeping on screen. Use a dropdown when there are more, or when the
 * options are long enough that a row of them would wrap.
 *
 * Only the chosen segment is drawn. There is no outline around the group and no
 * fill behind it, because the one thing worth marking is which option is in
 * force, and an outline around all of them marks the thing that was never in
 * question. It also means the control carries no assumption about the surface it
 * is dropped onto: a track with a fill of its own has to be light enough to show
 * on one screen's background and dark enough on another's, and there is no value
 * that is both.
 */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { options, value, onChange, label } = props;

  return (
    <div
      role="group"
      aria-label={label}
      // inline-flex so a group standing on its own sizes to its segments instead
      // of stretching across the column. Inside a flex row this blockifies to
      // plain flex, so a caller laying it out in one loses nothing.
      className="inline-flex flex-shrink-0 items-center gap-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.disabled ? option.disabledReason : undefined}
          onClick={() => onChange(option.value)}
          // `pressed` is the far end of the neutral ramp, the same fill the
          // settings header and the chosen sidebar item take. One token for
          // "this is the one in force", wherever that has to be said.
          className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            option.value === value
              ? 'bg-surface-pressed text-text-primary'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
