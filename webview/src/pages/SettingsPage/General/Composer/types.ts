import type { SettingKey } from '@/types/settings';

/**
 * What a composer row is handed by its section.
 *
 * These two rows take props where every other settings row takes none, because
 * they are the one pair that constrains each other: neither can decide on its
 * own whether a change is allowed, since the answer depends on what the other
 * one is set to. The section holds both, so the section decides.
 */
export interface ComposerRowProps {
  /** Save this value, unless it would collide with the other row. */
  commit: (key: SettingKey, value: string) => void;
  /** Why the last change was refused, or nothing if it was not. */
  error?: string;
}
