import type { ReactNode } from 'react';
import type { AnnouncementPlacement } from '@/shared';

/**
 * An announcement that ships with the app rather than arriving from the server.
 *
 * Deliberately NOT the SDUI `Announcement` schema. A served announcement has to
 * be describable as data because it is authored remotely; one that lives in the
 * codebase has no such constraint, so it is a component and can look like
 * whatever it needs to. The two only share where they appear and the fact that
 * one of them gets that spot.
 */
export interface InlineAnnouncement {
  /** Stable id: dismissal is recorded against it, and it keys the render. */
  id: string;
  /** Which slot this competes for. */
  placement: AnnouncementPlacement;
  /**
   * Whether this has anything to say right now — called as a hook, so it may
   * read queries and stores. Kept apart from rendering so a slot can pick
   * between candidates without rendering them all.
   */
  useIsRelevant: () => boolean;
  /** Renders the announcement. Free-form by design. */
  render: () => ReactNode;
}
