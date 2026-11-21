import type { ReactNode, SVGProps } from 'react';

/**
 * The three "where does this sit" glyphs, drawn after Notion's view menu: a
 * rounded window outline with a filled block whose place says where the view
 * sits. They are one family, so they share the outline and differ only in the
 * block. The fourth placement, a tab of its own, uses the open-in-new-tab icon.
 *
 * Drawn on a 20px grid with `currentColor`, so the surrounding text colour
 * (and its hover) paints them like the heroicons beside them.
 */
type IconProps = SVGProps<SVGSVGElement>;

const OUTLINE = { x: 1.75, y: 3.75, width: 16.5, height: 12.5, rx: 2.25 } as const;

function Frame(props: IconProps & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/** A block on the right edge of the window. */
export function SideViewIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect {...OUTLINE} stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.2" y="6.2" width="5.6" height="7.6" rx="0.8" fill="currentColor" />
    </Frame>
  );
}

/** A block floating in the middle of the window. */
export function CenterViewIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect {...OUTLINE} stroke="currentColor" strokeWidth="1.5" />
      <rect x="4.6" y="6.9" width="10.8" height="6.2" rx="1" fill="currentColor" />
    </Frame>
  );
}

/** A block that fills the window. */
export function FullPageViewIcon(props: IconProps) {
  return (
    <Frame {...props}>
      <rect {...OUTLINE} stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.9" y="6.1" width="12.2" height="7.8" rx="1" fill="currentColor" />
    </Frame>
  );
}
