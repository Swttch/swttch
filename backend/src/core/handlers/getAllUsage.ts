import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import { MessageType } from '../../shared';
import { readRegistry } from '../features/account-store';
import type { StoredAccount } from '../../shared';
import { runCcbUsage, classifyError } from './getUsage';
import type { AccountUsage, AccountUsageData } from '../../shared';

interface CacheEntry {
  data: AccountUsage;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export function resetAllUsageCache(): void {
  cache.clear();
}

export async function getAllUsageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const force = (message.payload as { force?: boolean })?.force === true;
  const workingDir = (message.payload as { workingDir?: string })?.workingDir;

  if (workingDir) {
    await Claude.applyConfigDir(workingDir);
  }

  if (force) {
    cache.clear();
  }

  try {
    const registry = await readRegistry();
    const savedAccounts = Object.values(registry.accounts);

    // Resolve active email
    let liveEmail: string | null = null;
    try {
      // execAuthed so the resolved active account matches the chat spawn's credentials
      // (inherited OAuth tokens stripped identically); env-provided API keys are kept.
      const { stdout } = await Claude.execAuthed(['auth', 'status', '--json'], workingDir, { timeout: 8000 });
      // Extract the JSON object to guard against shell banner noise on Windows/Linux
      // that can prefix or suffix the actual JSON output.
      const match = stdout.match(/\{[\s\S]*\}/);
      if (match) {
        const authStatus = JSON.parse(match[0]);
        liveEmail = authStatus?.email || null;
      }
    } catch {
      // ignore
    }

    // Synthesize if active account is not in the registry
    const activeInRegistry = savedAccounts.some((a) => a.emailAddress === liveEmail);
    if (liveEmail && !activeInRegistry) {
      savedAccounts.push({
        id: 'live',
        emailAddress: liveEmail,
        displayName: 'Live CLI Account',
        organizationName: null,
        subscriptionType: null,
        authMethod: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCached: null,
        usageCachedAt: 0,
      });
    }

    const accountsPromises = savedAccounts.map(async (account) => {
      const active = liveEmail !== null && account.emailAddress === liveEmail;
      const cacheKey = account.id;

      if (!force) {
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
          return {
            ...cached.data,
            active,
          };
        }
      }

      let usage: AccountUsageData | null = null;
      let error: string | null = null;
      let errorKind: string | null = null;

      if (active) {
        try {
          const rawUsage = await runCcbUsage();
          usage = {
            five_hour: rawUsage.five_hour || null,
            seven_day: rawUsage.seven_day || null,
            seven_day_sonnet: rawUsage.seven_day_sonnet || null,
            seven_day_opus: rawUsage.seven_day_opus || null,
          };
        } catch (err: any) {
          const code = err instanceof Error ? (err as any).code : undefined;
          const info = classifyError(err instanceof Error ? err.message : String(err), code);
          error = info.message;
          errorKind = info.kind;
        }
      } else {
        if (account.id === 'live') {
          error = 'credentials are unavailable';
          errorKind = 'auth';
        } else {
          // Read from usage data cached when this account was last active.
          // Only the active account ever calls ccb — no direct HTTP to Anthropic.
          usage = account.usageCached ?? null;
          if (!usage) {
            error = 'Switch to this account to load its usage data.';
            errorKind = 'unknown';
          }
        }
      }

      const result: AccountUsage = {
        id: account.id,
        emailAddress: account.emailAddress,
        displayName: account.displayName,
        subscriptionType: account.subscriptionType,
        active,
        usage,
        error,
        errorKind,
      };

      cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    });

    const accounts = await Promise.all(accountsPromises);

    // Sort: active first, then lexicographically by emailAddress
    accounts.sort((a, b) => {
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      return a.emailAddress.localeCompare(b.emailAddress);
    });

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      accounts,
    });
  } catch (err: any) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      accounts: [],
      error: err.message || 'Failed to fetch all usage info',
    });
  }
}
