export interface SelectOption {
  value: string;
  label: string;
  /** Render the option (and the trigger when selected) in muted italic, e.g. "Not set (use global)". */
  italic?: boolean;
  /**
   * A short audio sample of what the option stands for (a voice). A small sound icon marks the option, and the sample
   * plays while the pointer is on that icon (not on the row) and stops when it leaves.
   */
  previewUrl?: string;
}
