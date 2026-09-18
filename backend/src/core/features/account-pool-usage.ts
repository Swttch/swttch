import type { CcbUsageResponse } from '../handlers/getUsage';
import type { AccountUsageData } from '../../shared';
import { readRegistry, accountSnapshotPath, type AccountsRegistry } from './account-store';
import { Command } from '../command';
import { Claude } from '../claude';

const USAGE_TIMEOUT_MS = 15_000;
const ACCOUNT_USAGE_CAPABILITY = 'oauth.usage.account-file';

/**
 * External CLI owns credential reads and HTTP; this process sends only a file path.
 *
 * [workingDir] names the project whose settings apply. It is not optional in spirit: ccb
 * reads Claude's settings files itself, and the project half of those lives under the
 * working directory, so a caller that omits it gets global settings — no project proxy and
 * no project token. The auto-resume hook used to have no way to name one at all, which is
 * the gap this parameter closes.
 */
export function fetchAccountUsage(accountId: string, workingDir?: string): Promise<CcbUsageResponse> {
  // Several sessions reach their usage limit on the same turn, and each one asks
  // about every pool member. Left alone that is (sessions × accounts × 2) `ccb`
  // children spawned at once, all asking the same questions, and the ones that lose
  // the race come back rate-limited or timed out — which recovery then reads as
  // "nothing certain to switch to". Requests that overlap in time share one child.
  //
  // This is NOT a cache: the entry is dropped the moment the child exits, so the
  // next limit still gets a fresh reading. Sharing an IN-FLIGHT request only means
  // asking one question once, and every sharer gets the answer the question had.
  const key = JSON.stringify([accountId, workingDir ?? null]);
  const shared = inFlightUsage.get(key);
  if (shared) return shared;
  // Dropped in `finally`, which runs BEFORE this promise settles, so a caller that
  // awaits an answer and immediately asks again spawns a fresh child instead of being
  // handed the reading it just took delivery of. Chaining the cleanup onto the promise
  // resumes that caller first and leaves a spent entry standing for it to find.
  // Deleting by key alone is safe: while this entry stands, every caller for the same
  // key is handed it rather than starting a second one, so the entry found here can
  // only be this request.
  const request = (async () => {
    try { return await runAccountUsage(accountId, workingDir); }
    finally { inFlightUsage.delete(key); }
  })();
  inFlightUsage.set(key, request);
  return request;
}
const inFlightUsage = new Map<string, Promise<CcbUsageResponse>>();

async function runAccountUsage(accountId: string, workingDir?: string): Promise<CcbUsageResponse> {
  const registry = await readRegistry();
  if (!registry.accounts[accountId]) throw new Error('Saved account no longer exists');
  // Settle the Claude data directory before the child exists to inherit it. `Command` is the
  // generic runner and knows nothing about Claude, so it cannot do this the way Claude.exec does.
  await Claude.applyConfigDir(workingDir);
  // The same strip the chat spawn gets, so this reads the account the chat actually uses.
  // A saved-account query answers from a snapshot file, but the capability probe beside it
  // does not, and neither should authenticate with a credential `claude` discards.
  const env = await Claude.authStripEnv(workingDir);
  const binary = await new Command('ccb').which();
  if (!binary) throw new Error('The ccb CLI is not installed');
  // Old ccb versions ignore unrecognised flags: never let them silently query
  // the active account while claiming to have inspected another account.
  const { stdout: capabilities } = await new Command(binary, ['--capabilities', '--json'], { timeout: 5000, cwd: workingDir, env }).exec();
  let supported = false;
  try {
    supported = (JSON.parse(capabilities) as { capabilities?: string[] }).capabilities?.includes(ACCOUNT_USAGE_CAPABILITY) === true;
  } catch { /* Old versions print help text. */ }
  if (!supported) throw new Error('Update ccb to enable saved-account usage queries');
  const { stdout } = await new Command(binary, ['oauth', 'usage', '--json',
    `--account-file=${accountSnapshotPath(accountId)}`], { timeout: USAGE_TIMEOUT_MS, cwd: workingDir, env }).exec();
  // Direct argv invocation preserves spaces in snapshot paths; no shell or token argument.
  try { return JSON.parse(stdout) as CcbUsageResponse; }
  catch { throw new Error('Invalid account usage response from ccb'); }
}

/** null means indeterminate; empty string means quota is available. */
export function accountResetsAt(usage: Pick<CcbUsageResponse, keyof AccountUsageData>, model?: string): string | null {
  if (!usage.five_hour) return null;
  const buckets = [usage.five_hour, usage.seven_day];
  const knownModel = model && /opus|sonnet|haiku/i.test(model);
  if (!knownModel || /opus/i.test(model!)) buckets.push(usage.seven_day_opus);
  if (!knownModel || /sonnet/i.test(model!)) buckets.push(usage.seven_day_sonnet);
  let reset = 0;
  for (const bucket of buckets) {
    if (!bucket) continue;
    // API utilization is a percentage: 1 means 1%, never 100%.
    if (!Number.isFinite(bucket.utilization) || bucket.utilization < 0) return null;
    if (bucket.utilization < 100) continue;
    const at = Date.parse(bucket.resets_at ?? "");
    if (!Number.isFinite(at)) return null;
    reset = Math.max(reset, at);
  }
  return reset ? new Date(reset).toISOString() : '';
}

/**
 * Pick the account the pool should continue on, in pool order starting after the
 * one that ran out. Read every member before deciding; caches never certify a
 * candidate.
 *
 * [currentAccountId] is the account that RAN OUT, which is what the rotation turns
 * around. It defaults to the registry's current account, but a caller that knows
 * better must say so: while several sessions recover at once the registry names
 * whoever another session just switched to, and rotating around THAT skips the
 * account this session still has to move off of.
 *
 * A reading only removes a candidate when it proves exhaustion. A lookup that
 * failed, or an answer this code cannot read, leaves the candidate in the running:
 * the CLI already said the current account is out, so an unverified neighbour is a
 * better bet than staying put. Trying it costs one message that may come back
 * limited, and the pool then rotates again; refusing to try costs the whole feature
 * every time a usage query is slow or rate-limited.
 */
export async function selectAccountPoolAccount(
  registry: AccountsRegistry,
  model?: string,
  fetchUsage: typeof fetchAccountUsage = fetchAccountUsage,
  currentAccountId: string | null = registry.current,
): Promise<{ accountId: string; resetsAt: string | null } | null> {
  const current = currentAccountId;
  if (!current) return null;
  const pool = registry.accountPools.find(p => p.enabled && p.accountIds.includes(current));
  if (!pool) return null;
  const index = pool.accountIds.indexOf(current);
  const ids = [...pool.accountIds.slice(index + 1), ...pool.accountIds.slice(0, index + 1)]
    .filter(id => registry.accounts[id]);
  if (ids.length < 2) return null;
  const readings = await Promise.all(ids.map(async accountId => {
    try {
      return { accountId, resetsAt: accountResetsAt(await fetchUsage(accountId), model) };
    } catch {
      // Auth/network errors are not evidence of exhaustion.
      return { accountId, resetsAt: null };
    }
  }));
  // `ids` is already the rotation order, so the first match is the next in line.
  // A just-limited current account cannot be certified by lagging usage data.
  const candidates = readings.filter(r => r.accountId !== current);
  const available = candidates.find(r => r.resetsAt === '');
  if (available) return { accountId: available.accountId, resetsAt: null };
  const unverified = candidates.find(r => r.resetsAt === null);
  if (unverified) return { accountId: unverified.accountId, resetsAt: null };
  // Every candidate is provably exhausted. Waiting is the only move left, so hand
  // back whichever account frees up first — including the current one. That answer
  // needs every reading to name a time, which is why an unreadable current account
  // ends the search instead of joining the comparison.
  if (readings.some(r => !r.resetsAt)) return null;
  return readings.reduce((a, b) => Date.parse(a.resetsAt!) <= Date.parse(b.resetsAt!) ? a : b);
}
