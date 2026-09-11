import type { CcbUsageResponse } from '../handlers/getUsage';
import type { AccountUsageData } from '../../shared';
import { readRegistry, accountSnapshotPath, type AccountsRegistry } from './account-store';
import { Command } from '../command';

const USAGE_TIMEOUT_MS = 15_000;
const ACCOUNT_USAGE_CAPABILITY = 'oauth.usage.account-file';

/** External CLI owns credential reads and HTTP; this process sends only a file path. */
export async function fetchAccountUsage(accountId: string): Promise<CcbUsageResponse> {
  const registry = await readRegistry();
  if (!registry.accounts[accountId]) throw new Error('Saved account no longer exists');
  const binary = await new Command('ccb').which();
  if (!binary) throw new Error('The ccb CLI is not installed');
  // Old ccb versions ignore unrecognised flags: never let them silently query
  // the active account while claiming to have inspected another account.
  const { stdout: capabilities } = await new Command(binary, ['--capabilities', '--json'], { timeout: 5000 }).exec();
  let supported = false;
  try {
    supported = (JSON.parse(capabilities) as { capabilities?: string[] }).capabilities?.includes(ACCOUNT_USAGE_CAPABILITY) === true;
  } catch { /* Old versions print help text. */ }
  if (!supported) throw new Error('Update ccb to enable saved-account usage queries');
  const { stdout } = await new Command(binary, ['oauth', 'usage', '--json',
    `--account-file=${accountSnapshotPath(accountId)}`], { timeout: USAGE_TIMEOUT_MS }).exec();
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

/** Read every member before deciding; caches never certify a candidate. */
export async function selectAccountPoolAccount(
  registry: AccountsRegistry,
  model?: string,
  fetchUsage: typeof fetchAccountUsage = fetchAccountUsage,
): Promise<{ accountId: string; resetsAt: string | null } | null> {
  const current = registry.current;
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
  // A just-limited current account cannot be certified by lagging usage data.
  const available = readings.find(r => r.accountId !== current && r.resetsAt === '');
  if (available) return { accountId: available.accountId, resetsAt: null };
  if (readings.some(r => !r.resetsAt)) return null;
  return readings.reduce((a, b) => Date.parse(a.resetsAt!) <= Date.parse(b.resetsAt!) ? a : b);
}
