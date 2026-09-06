import type { AnnouncementPlacement } from '@/shared';
import { INLINE_ANNOUNCEMENTS } from './registry';
import type { InlineAnnouncement } from './types';

/**
 * The inline announcements that have something to say for this placement.
 *
 * Every entry's `useIsRelevant` runs on every call — the registry is a fixed
 * array, so the hooks are called in the same order every render — and the
 * placement filter is applied to the answers rather than to which hooks run.
 *
 * A slot appends these behind whatever came from the server, so a served
 * announcement always wins the spot and the built-in ones fill it the rest of
 * the time. Neither has to know about the other.
 */
export function useInlineAnnouncements(placement: AnnouncementPlacement): InlineAnnouncement[] {
  const relevance = INLINE_ANNOUNCEMENTS.map((announcement) => announcement.useIsRelevant());
  return INLINE_ANNOUNCEMENTS.filter(
    (announcement, index) => announcement.placement === placement && relevance[index],
  );
}
