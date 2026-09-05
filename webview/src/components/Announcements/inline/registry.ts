import { accountPoolNudge } from './accountPoolNudge';
import type { InlineAnnouncement } from './types';

/**
 * Every inline announcement the app ships with.
 *
 * A fixed list, in order: each entry's `useIsRelevant` is a hook, so the array
 * must not change shape between renders. Adding one means adding a line here.
 */
export const INLINE_ANNOUNCEMENTS: readonly InlineAnnouncement[] = [
  accountPoolNudge,
];
