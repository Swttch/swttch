import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType, DictationErrorKind } from '@/shared';

export interface DictationAvailability {
  /** This machine can dictate right now. */
  available: boolean;
  /** Why not, when it cannot. Null while it can. */
  reason: DictationErrorKind | null;
}

interface RawResult {
  status?: string;
  available?: boolean;
  reason?: DictationErrorKind | null;
}

/**
 * Whether dictation can run on this machine, and why not when it cannot.
 *
 * The kit being installed is only half of "can I dictate": the stream is opened
 * with the OAuth token a Claude account login leaves behind, so a machine
 * authenticated by API key alone has a perfectly installed kit and still cannot
 * record a word (#355). See {@link DictationErrorKind.NOT_LOGGED_IN} for why we
 * do not send an API key instead. The voice settings claim to describe the state
 * of the feature, so they have to say this too rather than leaving it to be
 * discovered by pressing the microphone.
 *
 * Answered by reading the local credential store, which is cheap but not free,
 * and the answer only changes when the user signs in or out. So it is cached
 * like the kit lookup beside it rather than asked again on every render.
 */
export function useDictationAvailability(options?: { enabled?: boolean }) {
  const { send, isConnected } = useBridgeContext();

  const query = useQuery<DictationAvailability>({
    queryKey: [MessageType.GET_DICTATION_AVAILABILITY],
    queryFn: async () => {
      const r = (await send(MessageType.GET_DICTATION_AVAILABILITY, {})) as RawResult;
      return { available: r.available ?? false, reason: r.reason ?? null };
    },
    enabled: isConnected && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });

  return { availability: query.data, loading: query.isLoading };
}
