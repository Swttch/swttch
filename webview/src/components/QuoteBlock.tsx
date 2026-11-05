import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Cut the text to this many lines; none shows all of it. */
  clamp?: 1 | 2 | 3;
  /** `sm` is for the small cards, `md` for the chat itself. */
  size?: 'sm' | 'md';
  className?: string;
}

const CLAMP: Record<number, string> = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3' };

/**
 * A quote the way Claude Desktop draws one: a thick bar with round ends beside grey text. Every quote of the
 * reply feature (the bubble, the cards, the dialog, the reply box) goes through this, so they look alike.
 */
export function QuoteBlock({ children, clamp, size = 'md', className = '' }: Props) {
  const text = size === 'sm' ? 'text-[0.7692rem] leading-[1.4]' : 'text-[1rem] leading-[1.55]';
  const gap = size === 'sm' ? 'gap-1.5' : 'gap-3';
  const bar = size === 'sm' ? 'w-[2px]' : 'w-[3px]';
  return (
    <div className={`flex min-w-0 ${gap} ${className}`}>
      <span aria-hidden className={`${bar} shrink-0 self-stretch rounded-full bg-text-primary/25`} />
      <div className={`min-w-0 whitespace-pre-wrap break-words text-text-primary/55 ${text} ${clamp ? CLAMP[clamp] : ''}`}>{children}</div>
    </div>
  );
}
