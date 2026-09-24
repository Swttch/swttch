/**
 * Kinds of desktop notifications the app can emit.
 *
 * To add a new kind, add an entry here plus a template in templates.ts and
 * wire the trigger at the appropriate site.
 */
export enum NotificationKind {
  SESSION_COMPLETE = 'SESSION_COMPLETE',
  STREAM_ERROR = 'STREAM_ERROR',
  AWAITING_PERMISSION = 'AWAITING_PERMISSION',
  AWAITING_PLAN_APPROVAL = 'AWAITING_PLAN_APPROVAL',
  AWAITING_USER_INPUT = 'AWAITING_USER_INPUT',
  /** The auto-resume countdown began (quota reset reached); resume fires in ~30s. */
  AUTO_RESUME_COUNTDOWN = 'AUTO_RESUME_COUNTDOWN',
}

export interface NotificationContext {
  sessionTitle: string | null;
}

export interface NotificationTemplate {
  title: (ctx: NotificationContext) => string;
  // Resolved lazily so the translation lookup happens at notify() time (after
  // i18n init / on the current locale), not when this module is first loaded.
  body: () => string;
  icon: string;
}

/**
 * Sentinel the sound dropdown uses for its "Off" row.
 *
 * It exists only inside the settings row, because a `<Select>` needs a string
 * for every option and "no sound" is one of the options. It is never stored and
 * never sent: the stored form of "no sound" is `null` in the
 * `notificationSound` plugin setting, and the wire carries no sound name at all.
 *
 * Any other string value is a backend-issued `soundId` (see `SystemSound.id`).
 */
export const SOUND_OFF = 'off' as const;

/**
 * What the sound dropdown currently shows.
 *
 * - `'off'`          → the Off row is selected; the setting is stored as null
 * - any other string → a backend `soundId`
 */
export type SoundSelection = typeof SOUND_OFF | string;

/**
 * One OS system sound exposed by the backend's `LIST_SYSTEM_SOUNDS` RPC.
 *
 * - `id`    is the canonical key the backend uses to map back to a path
 *           (sent in `PLAY_SYSTEM_SOUND { soundId }`).
 * - `label` is a user-facing string for display in the settings UI.
 */
export interface SystemSound {
  id: string;
  label: string;
}
