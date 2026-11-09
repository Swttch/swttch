/*
  The glyphs of the lines under a message in the Transcript view modes. They are drawn after the ones under a
  reply in the Claude app: two stacked rounded squares for copy, and for fork a line that turns up and away from
  a second arrow heading down. The classic chat has its own copies in `MessageFooter`, so a change here never
  reaches it.
*/
export function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7.5 5V4.5A1.5 1.5 0 0 1 9 3h6.5A1.5 1.5 0 0 1 17 4.5V11a1.5 1.5 0 0 1-1.5 1.5H15" />
      <rect x="3" y="7.5" width="9.5" height="9.5" rx="1.5" />
    </svg>
  );
}

export function ForkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 10h6.5L17 3" />
      <path d="M12 3h5v5" />
      <path d="M12 12l4.5 4.5" />
      <path d="M17 12v5h-5" />
    </svg>
  );
}

export function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3.5 8v4h2.8L10.5 15.5v-11L6.3 8H3.5z" />
      <path d="M13.2 7.3a3.7 3.7 0 0 1 0 5.4" />
      <path d="M15.2 5.3a6.5 6.5 0 0 1 0 9.4" />
    </svg>
  );
}

export function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <rect x="5.5" y="4.5" width="3.2" height="11" rx="1" />
      <rect x="11.3" y="4.5" width="3.2" height="11" rx="1" />
    </svg>
  );
}

export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 4.6v10.8a.8.8 0 0 0 1.2.7l8.4-5.4a.8.8 0 0 0 0-1.4L7.7 3.9a.8.8 0 0 0-1.2.7z" />
    </svg>
  );
}
