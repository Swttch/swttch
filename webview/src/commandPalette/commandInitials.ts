/**
 * Finding a command by the first letters of its words (issue #666).
 *
 * '/grill-with-docs' is found by 'gwd', and '/oh-my-claudecode:analyze' by
 * 'omca'. Words are split at the same separators the CLI uses to split a
 * command name into parts (':', '_' and '-'). The CLI itself does not offer
 * this, so it is only a faster way to reach the full name: what gets sent is
 * always the full name.
 */

const NAME_SEPARATORS = /[:_-]/;

/** Fewer letters than this match too many commands to be worth a result. */
export const MIN_INITIALS_QUERY_LENGTH = 2;

/**
 * The first letter of each word of a command name, lower-cased, or null when
 * the name is a single word (its initial is already what a name search finds).
 */
export function initialsOf(label: string): string | null {
  const words = label.replace(/^\//, '').split(NAME_SEPARATORS).filter(Boolean);
  if (words.length < 2) return null;
  return words.map(w => w[0]).join('').toLowerCase();
}

/** How an initials query relates to a command name. */
export type InitialsMatch = 'exact' | 'prefix' | null;

/** 'gwd' is exact for grill-with-docs, 'gw' a prefix of its initials. */
export function matchInitials(label: string, query: string): InitialsMatch {
  const q = query.toLowerCase();
  if (q.length < MIN_INITIALS_QUERY_LENGTH) return null;
  const initials = initialsOf(label);
  if (!initials) return null;
  if (initials === q) return 'exact';
  return initials.startsWith(q) ? 'prefix' : null;
}

/**
 * The name split into segments with the matched initials marked, for the
 * palette to bold. Only the first letters of the leading words count.
 */
export function highlightInitials(label: string, query: string): { text: string; matched: boolean }[] {
  if (!matchInitials(label, query)) return [{ text: label, matched: false }];
  const count = query.length;
  const segments: { text: string; matched: boolean }[] = [];
  let plain = '';
  let used = 0;
  let atWordStart = true;
  for (const ch of label) {
    if (ch === '/' ) { plain += ch; continue; }
    if (NAME_SEPARATORS.test(ch)) { plain += ch; atWordStart = true; continue; }
    if (atWordStart && used < count) {
      if (plain) segments.push({ text: plain, matched: false });
      plain = '';
      segments.push({ text: ch, matched: true });
      used++;
    } else {
      plain += ch;
    }
    atWordStart = false;
  }
  if (plain) segments.push({ text: plain, matched: false });
  return segments;
}
