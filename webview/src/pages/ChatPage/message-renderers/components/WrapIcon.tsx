import {cn} from '@/utils/cn.ts';

/**
 * An arrow folding back onto the line below it — the editor convention for
 * wrapping. Inline rather than from an icon package: the webview ships none,
 * and every other icon here is written the same way.
 */
export const WrapIcon = ({active}: {active: boolean}) => (
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
    className={cn(active && 'text-accent-fg')}
  >
    <path d="M2 4h12" />
    <path d="M2 12h5" />
    <path d="M2 8h9a2.5 2.5 0 0 1 0 5h-2" />
    <path d="M6.5 11 4.5 13l2 2" />
  </svg>
);
