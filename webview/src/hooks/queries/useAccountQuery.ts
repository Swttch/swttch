import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';

/**
 * Raw account payload returned by GET_ACCOUNT (ClaudeAuthStatus + profile API
 * additions). Mirrors the shape both AuthContext and the account modal consume.
 */
export interface AccountData {
  loggedIn?: boolean;
  authMethod?: string;
  email?: string | null;
  subscriptionType?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  /**
   * Which environment variable supplied the credential, when one did.
   *
   * The CLI reports `authMethod: "claude.ai"` for an API key just as it does for a
   * subscription login, and nulls email, org and plan alongside it. This is the field
   * that tells the two apart, and the account panel shows it in place of the blank
   * email row rather than leaving three empty lines that read as a broken product.
   */
  apiKeySource?: string | null;
}

/** Resolved account state. `account` is null when the backend definitively
 * answered "not logged in" (status='ok' with `loggedIn:false`). */
export interface AccountQueryResult {
  loggedIn: boolean;
  account: AccountData | null;
}

interface RawAccountResponse {
  status?: string;
  account?: AccountData;
  error?: string | null;
}

/**
 * Shared GET_ACCOUNT query — the single source of truth for CLI auth/account
 * status across AuthContext and the account modal. Any number of consumers that
 * read `[MessageType.GET_ACCOUNT]` share one in-flight request and one cache
 * entry, so the previously-duplicated GET_ACCOUNT fan-out collapses to one call.
 *
 * Two distinct failure modes are kept apart — this is the core of the
 * "reauthenticate repeatedly" fix (#178):
 * - A DETERMINED state resolves. The backend sends `status='ok'` only when
 *   `claude auth status` produced trustworthy JSON, so `loggedIn` (true OR false)
 *   is authoritative. A definitive logout resolves to `{ loggedIn: false }`.
 * - An UNDETERMINED state (`status='error'`: timeout / spawn error / unparseable
 *   output) *throws*. react-query then keeps the last successful `data` in cache,
 *   so a failed status check never flips a known login state to false and never
 *   bounces the user to the login page; with no prior data the consumer reads
 *   `undefined` → undetermined.
 */
export function useAccountQuery(): UseQueryResult<AccountQueryResult, Error> {
  const { isConnected, send } = useBridgeContext();
  const { workingDirectory } = useWorkingDir();

  // Key by workingDir and pass it along, so `auth status` reports the profile for the
  // active project (the backend resolves CLAUDE_CONFIG_DIR per project). (#123)
  return useQuery<AccountQueryResult, Error>({
    queryKey: [MessageType.GET_ACCOUNT, workingDirectory],
    enabled: isConnected,
    // The live account can change OUTSIDE the GUI (e.g. `claude` login / account
    // switch in a terminal), which emits no ACCOUNTS_CHANGED. Override the global
    // staleTime:Infinity / refetchOnWindowFocus:false so returning to the IDE
    // re-runs `claude auth status` and the GUI reflects the current account.
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const result = (await send(MessageType.GET_ACCOUNT, {
        workingDir: workingDirectory ?? undefined,
      })) as RawAccountResponse;
      if (result?.status === 'ok' && result.account) {
        return { loggedIn: result.account.loggedIn === true, account: result.account };
      }
      // status !== 'ok' → undetermined (transient). Throw so react-query keeps the
      // last known state instead of asserting a logout. (#178)
      throw new Error(result?.error ?? 'auth status undetermined');
    },
  });
}
