import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { useDictationAvailability } from '@/hooks/queries/useDictationAvailability';
import { DictationErrorKind } from '@/shared';

/** Why voice input cannot run right now, if it cannot. */
export interface VoiceAvailability {
  /** The extend kit is not installed, so there is nothing to record with. */
  kitMissing: boolean;
  /** The kit is installed but does not carry what dictation needs. */
  kitTooOld: boolean;
  /** The kit is installed and the backend could not run it. */
  kitUnusable: boolean;
  /**
   * What the failed run said, when {@link kitUnusable} is true.
   *
   * Relayed rather than rewritten. The cause is not something this screen can
   * name — the one measured instance is a Windows path with a space in it
   * (#471) — and this text is the part the user can search for.
   */
  detail: string | null;
  /** The kit is there but no Claude login is, so it cannot authorize. */
  notLoggedIn: boolean;
  /** Any of the above. The settings below the toggle are inert while true. */
  blocked: boolean;
}

/**
 * Whether voice input has what it needs to run.
 *
 * Two separate lookups because they fail for different reasons and only one of
 * them is about installation. Dictation authorizes with the OAuth token a Claude
 * account login leaves behind, so a machine running on an API key alone has
 * everything installed and still cannot record (#355).
 *
 * The kit lookup answers whether the package is on disk; the dictation lookup
 * answers whether it can actually serve. Those are different questions, and a
 * machine where the package is present and unrunnable answers yes to the first
 * and no to the second — which is the machine in #471, and the one that used to
 * be told its kit was missing.
 *
 * At most one of the four is true: a machine with no kit is reported as
 * kit_missing by both lookups, never as a missing login.
 */
export function useVoiceAvailability(): VoiceAvailability {
  const { info } = useExtendKit();
  const notInstalled = Boolean(info) && !info?.installed;

  const { availability } = useDictationAvailability();
  const reason = availability?.reason ?? null;

  // The dictation lookup decides which kit problem this is, because it is the
  // one that tried to USE the kit. The install lookup only knows whether a
  // version string exists on disk, and a version string is exactly what #471's
  // reporter had while nothing worked.
  const kitMissing = notInstalled || reason === DictationErrorKind.KIT_MISSING;
  const kitTooOld = !kitMissing && reason === DictationErrorKind.KIT_TOO_OLD;
  const kitUnusable = !kitMissing && reason === DictationErrorKind.KIT_UNUSABLE;
  const notLoggedIn = reason === DictationErrorKind.NOT_LOGGED_IN;

  return {
    kitMissing,
    kitTooOld,
    kitUnusable,
    detail: kitUnusable ? (availability?.detail ?? null) : null,
    notLoggedIn,
    blocked: kitMissing || kitTooOld || kitUnusable || notLoggedIn,
  };
}
