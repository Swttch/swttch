import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { DragDropProvider, useDroppable, useDragOperation, type DragEndEvent } from '@dnd-kit/react';
import { useAccounts } from '@/hooks/queries/useAccounts';
import type { AccountListItem, AccountPool } from '@/shared';
import { useTranslation } from '@/i18n';
import {
  AccountItem,
  AccountGhostRow,
  AccountDragKind,
  isLeavingPool,
  readDragTarget,
  type AccountDragData,
  type AccountPoolDropData,
} from './AccountItem';
import {
  AccountDropPosition,
  AccountPoolDropTargetKind,
  applyAccountDrop,
  createOrderedAccountPool,
  nextAccountId,
  poolAccounts,
  removeAccountFromPool,
  standaloneAccounts,
} from './accountPoolLayout';

/** The half of a dnd-kit drag operation this list reads an account id out of. */
interface DragEntity {
  id?: unknown;
  data?: Partial<AccountDragData>;
}

/**
 * Saved-accounts list. On mount, automatically saves the current account if it
 * is not yet in the registry (covers accounts logged in outside the plugin).
 */
export function AccountList() {
  const { t } = useTranslation('settings');
  const { accounts, accountPools, activeEmail, isLoading, error, save, switchTo, remove, savePools } = useAccounts();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // The live account email we last auto-saved for. Keyed by email (not a one-shot
  // boolean) so a NEW account logged in elsewhere (e.g. a terminal `claude` login)
  // is captured too — not just the very first one seen on mount.
  const autoSavedEmailRef = useRef<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('account.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isLoading || !activeEmail) return;
    // The live account is already saved (marked active) — nothing to capture.
    if (accounts.some((a) => a.active)) return;
    // Already attempted a save for this exact live account — don't loop on it.
    if (autoSavedEmailRef.current === activeEmail) return;
    autoSavedEmailRef.current = activeEmail;
    void run(save);
    // run/save are recreated each render; the per-email ref guards re-execution
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, accounts, activeEmail]);

  // Which standalone row has opened into a pool preview, if any. Kept in a ref
  // rather than state so that arming it does not re-render the list mid-drag —
  // re-rendering re-attaches the rows' element refs and drops the gesture. The
  // rows show the preview themselves; the list only needs the answer at drop.
  const springLoadedAccountRef = useRef<string | null>(null);
  const dropPositionRef = useRef(AccountDropPosition.AFTER);
  const handleSpringLoadChange = useCallback((accountId: string | null, position: AccountDropPosition) => {
    if (accountId) {
      springLoadedAccountRef.current = accountId;
      dropPositionRef.current = position;
    } else if (springLoadedAccountRef.current) {
      springLoadedAccountRef.current = null;
    }
  }, []);

  const handleDelete = (account: AccountListItem) => {
    void run(() => remove(account.id));
  };

  const handleSavePools = (nextPools: AccountPool[]) => {
    void run(() => savePools(nextPools));
  };

  const makePoolId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `pool-${crypto.randomUUID()}`;
    }
    return `pool-${Date.now().toString(16)}`;
  };

  const createPool = () => {
    const now = Date.now();
    return createOrderedAccountPool(makePoolId(), t('account.pool.defaultName', { value: accountPools.length + 1 }), now);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return;
    const source = readAccountDrag(event.operation.source as DragEntity | null | undefined);
    if (!source) return;
    const target = readDropTarget(event.operation.target as DragEntity | null | undefined);

    // An open preview wins over whatever the drag library currently calls the
    // target. Opening the preview moves rows around, so the library's answer can
    // drift off the row the user is looking at — and the promise on screen is the
    // one that has to be kept.
    const previewTargetId = springLoadedAccountRef.current;
    if (previewTargetId && previewTargetId !== source.accountId) {
      handleSavePools(applyAccountDrop(
        accountPools,
        source.accountId,
        { kind: AccountPoolDropTargetKind.ACCOUNT, accountId: previewTargetId },
        createPool,
        Date.now(),
        dropPositionRef.current,
      ));
      return;
    }

    // Dropped outside the pool card it came from: take it out of that pool.
    // Same `isLeavingPool` the row used to preview this, so the two cannot drift.
    // `removeAccountFromPool` compacts pools that fall below two members, so a
    // pool left with a single account dissolves and that account stands alone.
    if (source.poolId && isLeavingPool(source.poolId, target)) {
      handleSavePools(removeAccountFromPool(accountPools, source.poolId, source.accountId, Date.now()));
      return;
    }

    if (!target || target.kind !== AccountDragKind.ACCOUNT || !target.accountId) return;

    // Pairing two standalone accounts only happens for a preview the user saw,
    // handled above; a drag that merely passes over a row on its way somewhere
    // else must not silently create a pool.
    if (target.poolId === null) return;

    const nextPools = applyAccountDrop(
      accountPools,
      source.accountId,
      { kind: AccountPoolDropTargetKind.ACCOUNT, accountId: target.accountId },
      createPool,
      Date.now(),
      dropPositionRef.current,
    );
    handleSavePools(nextPools);
  };

  const activeAccountId = accounts.find((account) => account.active)?.id ?? null;
  const standalone = standaloneAccounts(accounts, accountPools);
  const shownError = actionError ?? error;

  return (
    <div>
      {shownError && (
        <p className="text-[0.8461rem] text-state-error-fg mb-3 px-3 py-2 bg-state-error-bg border border-state-error-border rounded-lg">
          {shownError}
        </p>
      )}

      {accounts.length === 0 ? (
        <p className="text-[0.8461rem] text-text-tertiary py-2">
          {isLoading ? t('account.loading') : t('account.empty')}
        </p>
      ) : (
        <DragDropProvider onDragEnd={handleDragEnd}>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[0.8461rem] font-medium text-text-secondary">
                {t('account.pool.accountsSectionTitle')}
              </h3>
              <span className="text-[0.7307rem] text-text-tertiary">
                {t('account.pool.accountCount', { count: accounts.length })}
              </span>
            </div>

            <div className="space-y-3">
              {accountPools.map((pool) => {
                const nextId = nextAccountId(pool, activeAccountId);
                const accountsInPool = poolAccounts(accounts, pool);
                return (
                  <AccountPoolCard key={pool.id} pool={pool}>
                    {accountsInPool.map((account) => (
                      <AccountItem
                        key={account.id}
                        account={account}
                        accounts={accounts}
                        poolId={pool.id}
                        busy={busy}
                        isNext={nextId === account.id}
                        onSwitch={(id) => void run(() => switchTo(id))}
                        onDelete={handleDelete}
                        onRemoveFromPool={(targetPoolId, accountId) =>
                          handleSavePools(removeAccountFromPool(accountPools, targetPoolId, accountId, Date.now()))
                        }
                        onSpringLoadChange={handleSpringLoadChange}
                      />
                    ))}
                  </AccountPoolCard>
                );
              })}

              {standalone.map((account) => (
                <AccountItem
                  key={account.id}
                  account={account}
                  accounts={accounts}
                  poolId={null}
                  busy={busy}
                  isNext={false}
                  onSwitch={(id) => void run(() => switchTo(id))}
                  onDelete={handleDelete}
                  onRemoveFromPool={() => undefined}
                  onSpringLoadChange={handleSpringLoadChange}
                />
              ))}

              <LeavingPoolSlot accounts={accounts} />
            </div>
          </section>
        </DragDropProvider>
      )}
    </div>
  );
}

/**
 * The empty slot that appears among the standalone accounts while a pooled
 * account is being dragged outside its pool card — where it will land.
 *
 * Subscribes to the drag itself rather than taking the answer as a prop, so the
 * list around it does not re-render on every drag move. Re-rendering the list
 * mid-drag re-attaches the rows' element refs, which unregisters the drag target
 * from under the gesture in flight.
 *
 * Deliberately a placeholder and not the row itself: moving the dragged row into
 * this list would change its parent, remount it, and break the drag for the same
 * reason.
 */
function LeavingPoolSlot(props: { accounts: AccountListItem[] }) {
  const { accounts } = props;
  const { source, target } = useDragOperation();
  const dragged = readAccountDrag(source as DragEntity | null | undefined);
  if (!dragged?.poolId) return null;
  if (!isLeavingPool(dragged.poolId, readDragTarget((target as DragEntity | null | undefined)?.data))) return null;

  const account = accounts.find((candidate) => candidate.id === dragged.accountId);
  if (!account) return null;

  return <AccountGhostRow account={account} />;
}

/** The account being dragged, with the pool it started in. */
function readAccountDrag(entity: DragEntity | null | undefined): { accountId: string; poolId: string | null } | null {
  if (!entity) return null;
  const data = entity.data;
  if (data?.kind === AccountDragKind.ACCOUNT && typeof data.accountId === 'string') {
    return { accountId: data.accountId, poolId: typeof data.poolId === 'string' ? data.poolId : null };
  }
  // dnd-kit falls back to the droppable id when data is unavailable.
  return typeof entity.id === 'string' && entity.id.startsWith('acc-')
    ? { accountId: entity.id, poolId: null }
    : null;
}

/** What the drag landed on: another account, a pool card, or nothing. */
function readDropTarget(
  entity: DragEntity | null | undefined,
): { kind: AccountDragKind; accountId: string | null; poolId: string | null } | null {
  if (!entity) return null;
  const data = entity.data;
  if (data?.kind === AccountDragKind.ACCOUNT || data?.kind === AccountDragKind.POOL) {
    return {
      kind: data.kind,
      accountId: typeof data.accountId === 'string' ? data.accountId : null,
      poolId: typeof data.poolId === 'string' ? data.poolId : null,
    };
  }
  return typeof entity.id === 'string' && entity.id.startsWith('acc-')
    ? { kind: AccountDragKind.ACCOUNT, accountId: entity.id, poolId: null }
    : null;
}

/**
 * A pool's card. Exists as a drop target so that dragging an account out of the
 * card can be told apart from dropping it onto another account — leaving the
 * card is what removes an account from the pool.
 */
function AccountPoolCard(props: { pool: AccountPool; children: ReactNode }) {
  const { pool, children } = props;
  const { ref } = useDroppable<AccountPoolDropData>({
    id: pool.id,
    type: AccountDragKind.POOL,
    accept: AccountDragKind.ACCOUNT,
    data: { kind: AccountDragKind.POOL, poolId: pool.id },
  });

  return (
    <div
      ref={ref}
      className="border border-border-default bg-border-default rounded-lg overflow-hidden shadow-sm py-1.5 px-2.5"
    >
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
