interface Props {
  className?: string;
}

/**
 * The six-dot drag handle: two columns of three round dots.
 *
 * Hand-written rather than taken from heroicons, which has no six-dot handle —
 * Bars2Icon (two horizontal strokes) stood in for it and read as a "collapse"
 * or "menu" glyph instead of something you grab.
 *
 * The viewBox is 10×16 rather than square: the dots sit closer together
 * horizontally than vertically, so a square box would either spread the columns
 * apart or leave dead space on both sides of a narrow glyph. Sizing this at
 * `h-4` therefore yields a ~10px-wide handle, matching how much room the gesture
 * actually needs.
 *
 * Geometry: columns at x=3/7 (4 apart), rows at y=3.5/8/12.5 (4.5 apart), r=1.
 * The dots are deliberately small against that pitch — a diameter of 2 against a
 * 4-unit gap. Fatter dots (r=1.25) closed the gaps up and read as two solid bars
 * at 14px, which is exactly the glyph this replaced.
 */
export function DragHandleIcon(props: Props) {
  const { className } = props;

  return (
    <svg
      viewBox="0 0 10 16"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="3" cy="3.5" r="1" />
      <circle cx="7" cy="3.5" r="1" />
      <circle cx="3" cy="8" r="1" />
      <circle cx="7" cy="8" r="1" />
      <circle cx="3" cy="12.5" r="1" />
      <circle cx="7" cy="12.5" r="1" />
    </svg>
  );
}
