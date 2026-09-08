import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { AccountPoolRecovery } from '../../shared';

function pathFor(sessionId: string): string {
  return join(homedir(), '.claude-code-gui', 'account-pool-recovery',
    createHash('sha256').update(sessionId).digest('hex') + '.json');
}
export async function readAccountPoolRecovery(sessionId: string): Promise<AccountPoolRecovery | null> {
  try {
    const value = JSON.parse(await readFile(pathFor(sessionId), 'utf8')) as AccountPoolRecovery;
    return typeof value.sourceMessageUuid === 'string' && typeof value.accountId === 'string'
      && typeof value.awaitingLimit === 'boolean' ? value : null;
  } catch { return null; }
}
let selectionRevision = 0;
/** Manual account selection takes priority over any pending automatic lookup. */
export function invalidateAccountPoolSelection(): void { selectionRevision += 1; }
export function accountPoolSelectionRevision(): number { return selectionRevision; }
const revisions = new Map<string, number>();
const writing = new Map<string, Promise<void>>();
export function accountPoolRecoveryRevision(sessionId: string): number {
  return revisions.get(sessionId) ?? 0;
}
function serialize<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
  const operation = (writing.get(sessionId) ?? Promise.resolve()).then(action);
  const settled = operation.then(() => undefined, () => undefined);
  writing.set(sessionId, settled);
  void settled.then(() => { if (writing.get(sessionId) === settled) writing.delete(sessionId); });
  return operation;
}
export function writeAccountPoolRecovery(
  sessionId: string, value: AccountPoolRecovery, revision = accountPoolRecoveryRevision(sessionId),
): Promise<boolean> {
  return serialize(sessionId, async () => {
    if (accountPoolRecoveryRevision(sessionId) !== revision) return false;
    const path = pathFor(sessionId);
    await mkdir(dirname(path), { recursive: true });
    const temp = path + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
      if (accountPoolRecoveryRevision(sessionId) !== revision) return false;
      await rename(temp, path);
      return true;
    } finally { await rm(temp, { force: true }); }
  });
}
export function clearAccountPoolRecovery(sessionId: string): Promise<void> {
  revisions.set(sessionId, accountPoolRecoveryRevision(sessionId) + 1);
  return serialize(sessionId, () => rm(pathFor(sessionId), { force: true }));
}

const claiming = new Map<string, Promise<boolean>>();
/** Claim before writing stdin so two tabs cannot both resume the same recovery. */
export async function claimAccountPoolContinuation(sessionId: string): Promise<boolean> {
  if (claiming.has(sessionId)) return false;
  const revision = accountPoolRecoveryRevision(sessionId);
  const claim = (async () => {
    const recovery = await readAccountPoolRecovery(sessionId);
    if (!recovery || recovery.continuationSent || !recovery.awaitingLimit) return false;
    return writeAccountPoolRecovery(sessionId, { ...recovery, continuationSent: true }, revision);
  })();
  claiming.set(sessionId, claim);
  try { return await claim; } finally { claiming.delete(sessionId); }
}
