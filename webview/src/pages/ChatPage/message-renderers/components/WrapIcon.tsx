/**
 * The wrap button's glyph (#179 follow-up).
 *
 * Three text lines, the second turning back on itself through an arrow — the
 * editor convention for a wrapped line.
 *
 * One drawing for both states. What separates them is the chip behind it: the
 * copy button's translucent backdrop while the block scrolls, the accent fill
 * while it folds. A second glyph would say the same thing twice and make the
 * pair read as two different controls.
 */
export const WrapIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 4h12" />
    <path d="M2 8h9a2.5 2.5 0 0 1 0 5H7" />
    <path d="M9 11l-2 2 2 2" />
    <path d="M2 12h2" />
  </svg>
);
