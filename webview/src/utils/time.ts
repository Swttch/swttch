/**
 * Convert timestamp to relative time string
 * e.g., "2 hours ago", "just now", "3 days ago"
 */
export function formatRelativeTime(timestamp: string | number): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec} seconds ago`;
  if (diffMin === 1) return '1 minute ago';
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHour === 1) return '1 hour ago';
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffWeek === 1) return '1 week ago';
  if (diffWeek < 4) return `${diffWeek} weeks ago`;
  if (diffMonth === 1) return '1 month ago';
  if (diffMonth < 12) return `${diffMonth} months ago`;
  if (diffYear === 1) return '1 year ago';
  return `${diffYear} years ago`;
}

/**
 * Get preview text from message content
 * Truncates to specified length and adds ellipsis
 */
export function getMessagePreview(content: string, maxLength: number = 50): string {
  const cleaned = content.trim().replace(/\n+/g, ' ');
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + '...';
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The time a message was sent, as shown under it (issue #498).
 *
 * Within a week the weekday is enough to place it: "(Thursday) 12:13 PM".
 * Past that a weekday repeats, so the date leads: "June 27 (Mon) 5:08 PM".
 * Each piece comes from `Intl` in the UI language, so every locale reads in
 * its own words with the same shape. Returns '' for an absent or unparseable
 * timestamp, so the caller can draw nothing.
 */
export function formatMessageTimestamp(
  timestamp: string | undefined,
  locale: string,
  now: Date = new Date(),
): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  if (now.getTime() - date.getTime() < WEEK_MS) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    return `(${weekday}) ${time}`;
  }
  const monthDay = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(date);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  return `${monthDay} (${weekday}) ${time}`;
}
