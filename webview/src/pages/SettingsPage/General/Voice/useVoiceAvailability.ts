import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { useDictationAvailability } from '@/hooks/queries/useDictationAvailability';
import { DictationErrorKind } from '@/shared';

/** Why voice input cannot run right now, if it cannot. */
export interface VoiceAvailability {
  /** The extend kit is not installed, so there is nothing to record with. */
  kitMissing: boolean;
  /** The kit is there but no Claude login is, so it cannot authorize. */
  notLoggedIn: boolean;
  /** Either of the above. The settings below the toggle are inert while true. */
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
 * Only one of the two is ever true: a machine with no kit is reported as
 * kit_missing by both lookups, never as a missing login.
 */
export function useVoiceAvailability(): VoiceAvailability {
  const { info } = useExtendKit();
  const kitMissing = Boolean(info) && !info?.installed;

  const { availability } = useDictationAvailability();
  const notLoggedIn = availability?.reason === DictationErrorKind.NOT_LOGGED_IN;

  return { kitMissing, notLoggedIn, blocked: kitMissing || notLoggedIn };
}
