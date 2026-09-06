import { useCallback, useEffect, useRef, useState } from 'react';
import { useDraggable, useDroppable, useDragOperation } from '@dnd-kit/react';
import { EllipsisVerticalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { AccountListItem } from '@/shared';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components';
import { AccountRow } from './AccountRow';
import {
  AccountDropIntent,
  AccountDropPosition,
  AccountRowZone,
  POOL_SPRING_LOAD_MS,
  accountRowHalf,
  accountRowZone,
} from './accountPoolLayout';

/**
 * What a drag lands on. Accounts are both draggable and droppable; a pool card
 * is droppable only, and exists as a target so that leaving it can be told
 * apart from landing on another account.
 */
export enum AccountDragKind {
  ACCOUNT = 'account',
  POOL = 'pool',
}

/**
 * The payload an account carries while dragging. Defined here because this
 * component is what attaches it; `AccountList` reads the same shape back in its
 * drag-end handler.
 */
export interface AccountDragData {
  kind: AccountDragKind;
  accountId: string;
  /** The pool the account currently sits in, or null when it stands alone. */
  poolId: string | null;
}

/** The payload a pool card carries as a drop target. */
export interface AccountPoolDropData {
  kind: AccountDragKind;
  poolId: string;
}

/** Whatever a drag is currently over, reduced to what the decision below needs. */
export interface AccountDragTarget {
  kind: AccountDragKind;
  poolId: string | null;
}

/**
 * True when an account that belongs to a pool is currently outside that pool.
 * Dropping here removes it from the pool.
 *
 * The drag library reports no target at all once the pointer leaves every drop
 * zone, which is exactly the "left the card" signal. Landing on another account
 * is a different gesture (join or reorder), so it does not count as leaving even
 * when that account belongs to another pool.
 *
 * Single source of truth on purpose: the row previews this while dragging and
 * `AccountList` acts on it at drop time. If each decided for itself, the preview
 * could promise something the drop does not do.
 */
export function isLeavingPool(sourcePoolId: string | null, target: AccountDragTarget | null): boolean {
  if (!sourcePoolId) return false;
  if (!target) return true;
  if (target.kind === AccountDragKind.ACCOUNT) return false;
  return target.poolId !== sourcePoolId;
}

export function readDragTarget(data: unknown): AccountDragTarget | null {
  if (!data || typeof data !== 'object') return null;
  const { kind, poolId } = data as Partial<AccountDragData & AccountPoolDropData>;
  if (kind !== AccountDragKind.ACCOUNT && kind !== AccountDragKind.POOL) return null;
  return { kind, poolId: typeof poolId === 'string' ? poolId : null };
}

/** The account a drag payload refers to, or null when it is not one of ours. */
export function findDraggedAccount(accounts: AccountListItem[], data: unknown): AccountListItem | null {
  if (!data || typeof data !== 'object') return null;
  const { kind, accountId } = data as Partial<AccountDragData>;
  if (kind !== AccountDragKind.ACCOUNT || typeof accountId !== 'string') return null;
  return accounts.find((candidate) => candidate.id === accountId) ?? null;
}

export interface AccountItemProps {
  account: AccountListItem;
  /** Every saved account, so a preview can name the one being dragged. */
  accounts: AccountListItem[];
  /** The pool this account sits in, or null when it stands alone. */
  poolId: string | null;
  busy: boolean;
  /** True when this account is the next one the pool would switch to. */
  isNext: boolean;
  onSwitch: (id: string) => void;
  onDelete: (account: AccountListItem) => void;
  onRemoveFromPool: (poolId: string, accountId: string) => void;
  /**
   * Called with this account's id once a drag has rested long enough over its
   * middle band to open a pool preview, and with null when that lapses. The list
   * reads it at drop time so a pool is only created for a preview the user
   * actually saw.
   */
  onSpringLoadChange: (accountId: string | null, position: AccountDropPosition, intent: AccountDropIntent) => void;
}

/**
 * One saved account in the settings list. Wraps the presentational `AccountRow`
 * with the drag-and-drop wiring that lets accounts be grouped into pools:
 * every account is both draggable (to group or reorder) and a drop target
 * (drop one onto another to create a pool).
 */
export function AccountItem(props: AccountItemProps) {
  const {
    account,
    accounts,
    poolId,
    busy,
    isNext,
    onSwitch,
    onDelete,
    onRemoveFromPool,
    onSpringLoadChange,
  } = props;
  const { t } = useTranslation('settings');
  const dragData: AccountDragData = { kind: AccountDragKind.ACCOUNT, accountId: account.id, poolId };
  const {
    ref: draggableRef,
    isDragging,
  } = useDraggable<AccountDragData>({
    id: account.id,
    type: AccountDragKind.ACCOUNT,
    data: dragData,
  });
  const {
    ref: droppableRef,
    isDropTarget,
  } = useDroppable<AccountDragData>({
    id: account.id,
    type: AccountDragKind.ACCOUNT,
    accept: AccountDragKind.ACCOUNT,
    data: dragData,
  });
  // Live view of the drag in flight. Once the pointer leaves every drop zone the
  // library reports no target, which is what "outside the pool card" looks like.
  const { source, target } = useDragOperation();
  const willLeavePool = isDragging && isLeavingPool(poolId, readDragTarget(target?.data));
  // Both "this row is lifted" and "some other row is previewing a slot for it"
  // read from the same signal. `isDragging` and `source` do not end together —
  // the operation outlives the flag by the length of the drop animation — and
  // keying the two off different signals showed the account twice for that gap.
  const isLifted = findDraggedAccount([account], source?.data) !== null;

  // ── Spring-loaded pool preview ──────────────────────────────────────────────
  // Hold a dragged account over a standalone account's middle band and, after a
  // beat, this row opens into a preview of the pool the drop would create. Only
  // standalone rows arm it: a row already in a pool is joined, not paired.
  const elementRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Where this row sat at the instant the preview opened. Opening the preview
  // adds a card and a ghost row, which moves this row out from under the pointer
  // — measuring against its new position would read the pointer as being above
  // a row it is actually inside, pick a side on that basis, move the row again,
  // and see the drag as having left. The frozen box is the one the user aimed at.
  const anchorRef = useRef<{ top: number; height: number } | null>(null);
  const [springLoaded, setSpringLoaded] = useState(false);
  const [dropPosition, setDropPosition] = useState(AccountDropPosition.AFTER);
  const [intent, setIntent] = useState(AccountDropIntent.PAIR);

  // A drag this row could receive. `isDropTarget` is only asked about while
  // arming: once open, the preview holds until the pointer leaves the card, so
  // the row shifting out from under the pointer cannot close what it just opened.
  const dragInFlight = !isLifted && Boolean(source) && !willLeavePool;
  const canArm = dragInFlight && isDropTarget;
  // A row already in a pool opens the moment it is the target. The wait exists to
  // separate "passing over" from "pair these two", and inside a pool there is
  // nothing to pair — the drag is only choosing an order.
  const opensWithoutWaiting = poolId !== null;

  useEffect(() => {
    if (!dragInFlight) {
      setSpringLoaded(false);
      anchorRef.current = null;
      return;
    }
    if (!springLoaded && !canArm) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let armedZone: AccountRowZone | null = null;

    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      armedZone = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (springLoaded) {
        const card = cardRef.current?.getBoundingClientRect();
        // Leaving the opened card is what closes it, not losing drop-target
        // status — the card is bigger than the row and stays under the pointer.
        if (card && (event.clientY < card.top || event.clientY > card.bottom
          || event.clientX < card.left || event.clientX > card.right)) {
          clear();
          setSpringLoaded(false);
          anchorRef.current = null;
          return;
        }
      }

      // Every band decision is measured against where this row sat when the drag
      // first reached it. Opening a preview inserts a slot and moves the row, so
      // re-measuring would read the pointer against a box that the preview itself
      // just shifted — the row would keep sliding out from under the pointer.
      if (!anchorRef.current) {
        const rect = elementRef.current?.getBoundingClientRect();
        if (!rect) return;
        anchorRef.current = { top: rect.top, height: rect.height };
      }
      const { top, height } = anchorRef.current;

      // An open pool preview has already answered "pair these two"; from here the
      // row is only two halves and the pointer picks a side. The thirds below are
      // for deciding what to open, which is settled.
      if (springLoaded && intent === AccountDropIntent.PAIR) {
        setDropPosition(accountRowHalf(event.clientY, top, height));
        return;
      }

      // Inside a pool there is nothing to pair, so the row splits in two and
      // opens at once; the drag is only choosing an order.
      if (opensWithoutWaiting) {
        setDropPosition(accountRowHalf(event.clientY, top, height));
        setIntent(AccountDropIntent.REORDER);
        setSpringLoaded(true);
        return;
      }

      const zone = accountRowZone(event.clientY, top, height);
      if (zone !== AccountRowZone.MIDDLE) {
        // The outer bands mean "put me above/below this one" — no pairing, and
        // no waiting, because there is nothing ambiguous to disambiguate.
        clear();
        setDropPosition(zone === AccountRowZone.TOP ? AccountDropPosition.BEFORE : AccountDropPosition.AFTER);
        setIntent(AccountDropIntent.REORDER);
        setSpringLoaded(true);
        return;
      }

      // Back in the middle band: a pool is what a pause here would make, so the
      // reorder preview steps aside and the countdown starts again.
      if (armedZone === AccountRowZone.MIDDLE) return;
      armedZone = AccountRowZone.MIDDLE;
      setSpringLoaded(false);
      timer = setTimeout(() => {
        setDropPosition(accountRowHalf(event.clientY, top, height));
        setIntent(AccountDropIntent.PAIR);
        setSpringLoaded(true);
      }, POOL_SPRING_LOAD_MS);
    };

    // Capture phase: the drag library stops pointermove from propagating while a
    // drag is in flight, so a listener on the bubble phase never runs. Capture
    // reaches the window before anything downstream can stop it.
    window.addEventListener('pointermove', onPointerMove, true);
    return () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      clear();
    };
  }, [dragInFlight, canArm, springLoaded, intent, opensWithoutWaiting]);

  useEffect(() => {
    onSpringLoadChange(springLoaded ? account.id : null, dropPosition, intent);
  }, [springLoaded, dropPosition, intent, account.id, onSpringLoadChange]);

  // Resolved for the whole drag, not just while the preview is open, so both
  // ghost slots can already be mounted (at zero height) and have something to
  // transition from the moment the preview opens.
  const draggedAccount = dragInFlight ? findDraggedAccount(accounts, source?.data) : null;

  // Must keep its identity across renders. The list re-renders mid-drag to show
  // the "will leave the pool" state, and a fresh ref callback would make React
  // detach and re-attach the element — which unregisters the drag target from
  // under the gesture in flight and drops the drag on the floor.
  const setElement = useCallback(
    (element: HTMLDivElement | null) => {
      draggableRef(element);
      droppableRef(element);
      elementRef.current = element;
    },
    [draggableRef, droppableRef],
  );

  const leading = (
    <div className="flex items-center gap-1 shrink-0">
      <div
        title={t('account.pool.dragAccount')}
        className="p-1 rounded cursor-grab select-none text-text-tertiary/60 hover:text-text-primary hover:bg-surface-hover"
      >
        <EllipsisVerticalIcon className="w-4 h-4" />
      </div>
    </div>
  );

  const statusBadge = (
    <>
      {willLeavePool && (
        <span className="text-[0.7307rem] text-state-error-fg border border-state-error-border bg-state-error-bg rounded px-1.5 py-0.5">
          {t('account.pool.removeFromPool')}
        </span>
      )}
      {isNext && !willLeavePool && (
        <span className="text-[0.7307rem] text-accent-primary border border-accent-primary/40 rounded px-1.5 py-0.5">
          {t('account.pool.next')}
        </span>
      )}
      {isDropTarget && !isDragging && (
        <span className="text-[0.7307rem] text-accent-primary border border-accent-primary/40 bg-accent-primary/10 rounded px-1.5 py-0.5">
          {t('account.pool.dropToGroup')}
        </span>
      )}
      {poolId && (
        <Tooltip content={t('account.pool.removeFromPool')}>
          <button
            type="button"
            onClick={() => onRemoveFromPool(poolId, account.id)}
            disabled={busy}
            className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-hover disabled:opacity-50"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      )}
    </>
  );

  // Exactly one surface class, picked here rather than concatenated: two `bg-*`
  // utilities on one element are resolved by their order in the stylesheet, not
  // by their order in this string, so emitting both would be a coin flip.
  const surfaceClass = willLeavePool
    ? 'bg-state-error-bg ring-1 ring-state-error-border'
    : isDropTarget && !isDragging
      ? 'bg-accent-primary/10 ring-1 ring-accent-primary/50'
      : 'bg-surface-base';

  // The wrapper is always rendered and only changes classes, never existence.
  // Introducing a parent mid-drag would move this row in the React tree and
  // remount it, which unregisters the drop target from under the gesture in
  // flight — the same trap that already broke the drag once. Styling an element
  // that was there all along costs nothing and keeps the row exactly where React
  // put it.
  return (
    <div
      ref={cardRef}
      className={`rounded-lg border border-dashed transition-all duration-200 ease-out ${
        // While this account is the one being dragged, `DragOverlay` is showing
        // it under the cursor, so its slot here folds away and the rest of the
        // list closes the gap — the account is in one place at a time.
        isLifted ? 'max-h-0 opacity-0 overflow-hidden border-transparent' : ''
      } ${
        springLoaded && intent === AccountDropIntent.PAIR && poolId === null
          ? 'border-accent-primary/60 bg-border-default px-2.5 py-1.5 space-y-1.5 shadow-sm'
          : 'border-transparent'
      }`}
    >
      {/* Both slots stay mounted for the whole drag and only change height. Adding
          and removing them would restart the animation on every switch and make
          the opposite side disappear at once, which is what made this jump. */}
      {draggedAccount && (
        <AccountGhostRow
          account={draggedAccount}
          open={springLoaded && dropPosition === AccountDropPosition.BEFORE}
        />
      )}
      <div
        ref={setElement}
        className={`relative rounded-md transition-colors ${
          springLoaded ? 'bg-surface-base' : surfaceClass
        }`}
      >
        <AccountRow
          account={account}
          busy={busy}
          onSwitch={onSwitch}
          onDelete={onDelete}
          leading={leading}
          statusBadge={statusBadge}
          className="flex items-center gap-3 py-3 border-b border-border-default last:border-b-0 cursor-grab active:cursor-grabbing"
        />
      </div>
      {draggedAccount && (
        <AccountGhostRow
          account={draggedAccount}
          open={springLoaded && dropPosition === AccountDropPosition.AFTER}
        />
      )}
    </div>
  );
}

/**
 * A saved account drawn as a placeholder: the same `AccountRow` in the same
 * layout, so a slot is the size and shape of what will land in it rather than an
 * approximation of one. Inert, because it previews a drop that has not happened.
 */
export function AccountGhostRow(props: { account: AccountListItem; open?: boolean }) {
  const { account, open = true } = props;
  // Height is transitioned rather than the element being added and removed, so
  // moving the slot from one side of a row to the other reads as the row gliding
  // between two openings instead of one slot vanishing and another appearing.
  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-md border-dashed border-accent-primary/60 bg-accent-primary/5 pointer-events-none px-2.5 transition-all duration-200 ease-out ${
        open ? 'max-h-32 opacity-60 border' : 'max-h-0 opacity-0 border-0'
      }`}
    >
      <AccountRow
        account={account}
        busy
        onSwitch={() => undefined}
        onDelete={() => undefined}
        leading={<GhostDragHandle />}
        className="flex items-center gap-3 py-3"
      />
    </div>
  );
}

/**
 * The row that follows the cursor during a drag.
 *
 * Rendered into `DragOverlay` so the account being dragged is a separate,
 * lifted copy. That is what lets the row's own slot in the list collapse: while
 * the list moved the real element around, the account was on screen twice at
 * once — once floating and once still sitting in the pool it was leaving.
 */
export function AccountDragPreview(props: { account: AccountListItem }) {
  return (
    <div className="rounded-md bg-surface-base px-2.5 shadow-lg ring-1 ring-accent-primary/40 cursor-grabbing">
      <AccountRow
        account={props.account}
        busy
        onSwitch={() => undefined}
        onDelete={() => undefined}
        leading={<GhostDragHandle />}
        className="flex items-center gap-3 py-3"
      />
    </div>
  );
}

/** Keeps a placeholder's leading column the same width as a real row's. */
function GhostDragHandle() {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <div className="p-1 rounded text-text-tertiary/40">
        <EllipsisVerticalIcon className="w-4 h-4" />
      </div>
    </div>
  );
}
