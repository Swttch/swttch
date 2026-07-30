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
      onClick={onCancel}
      className={`bg-transparent p-0 border-none cursor-pointer hover:text-text-primary hover:underline transition-colors ${className}`}
    >
      {label}
    </button>
  );
};
