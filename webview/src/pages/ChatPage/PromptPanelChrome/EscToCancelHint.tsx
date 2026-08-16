interface Props {
  label: string;
  onCancel: () => void;
  /** Typography/color of the host panel's footer — the hint stays text, not a button chrome. */
  className?: string;
}

/**
 * The "Esc to cancel" footer hint, clickable so pointer users get the same
 * escape hatch as keyboard users without turning it into a chunky button.
 */
export const EscToCancelHint = (props: Props) => {
  const { label, onCancel, className = '' } = props;

  return (
    <button
      type="button"
      // Called with no argument on purpose. React hands a click handler its
      // MouseEvent, and hosts wire this to a `(reason?: string) => void` deny —
      // the event arrived as the reason, the bridge could not serialise it
      // ("Converting circular structure to JSON"), and the cancel never reached
      // the CLI: the turn hung with the diff still open. Typing cannot catch
      // it, since passing an argument to a `() => void` is legal.
      onClick={() => onCancel()}
      className={`bg-transparent p-0 border-none cursor-pointer hover:text-text-primary hover:underline transition-colors ${className}`}
    >
      {label}
    </button>
  );
};
