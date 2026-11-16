import type { ReactNode } from 'react';

/**
 * The place the chat input stands in: the chat column's width, its side margins, and the space above and below the
 * box. Nothing in it knows what is drawn inside.
 *
 * The session input and the archived session bar both stand here, so a change to the column (its width, the margins,
 * the gap under the box) moves the two together, and the bar always covers exactly the place the input was.
 * `className` is for what the place needs to be told about itself, such as `h-full` when it must fill a box.
 */
export function InputColumn({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`w-full max-w-[var(--chat-column-max,44rem)] mx-auto px-4 sm:px-[var(--chat-column-px,1rem)] pb-[14px] pt-2 ${className}`}
    >
      {children}
    </div>
  );
}
