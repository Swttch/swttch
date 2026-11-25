import { useEffect, useRef, useState } from 'react';
import { useBridge } from '@/hooks/useBridge';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { useTranslation } from '@/i18n';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatStreamContextOrNull } from '@/contexts/ChatStreamContext';
import { MessageType, SessionActivity } from '@/shared';
import { Portal } from '@/components/Portal';
import { InputColumn } from './ChatInput/InputColumn';

const FOCUS_RING = 'focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[rgb(var(--border-focus-rgb))]';
const BUTTON_BASE = `shrink-0 rounded px-3 py-1 text-[0.7692rem] font-medium transition-colors ${FOCUS_RING}`;
const BUTTON_CLASS = `${BUTTON_BASE} bg-border-default text-text-primary hover:bg-surface-pressed`;
const BUTTON_INVERTED_CLASS = `${BUTTON_BASE} bg-text-primary text-surface-base hover:opacity-85`;

/** How a take-over is carried out: `now` interrupts a turn in flight, `afterTurn` waits for it to end. */
type TakeOverMode = 'now' | 'afterTurn';

interface Holder {
  activity: string;
  workingDir: string;
  ownerPid: number;
}

/**
 * Covers the chat input while another backend holds this session's CLI. This backend only watches the session; what
 * is typed here would have to cross to the other one. The way on is offered over the input: take the session over.
 * The button asks first (what it does to the other backend depends on what that backend is doing), then runs the
 * take-over with a spinner on the button. When the CLI is here, the session is no longer held elsewhere and the bar
 * goes by itself (see `useSessionHeldElsewhere`).
 *
 * Laid over the input exactly as the archived bar is: the input stays mounted under it (see `HeldElsewhereInputSlot`).
 */
export function HeldElsewhereBar({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('chat');
  const { send } = useBridge();
  const { requestedInputMode } = useSessionContext();
  const sessionModel = useChatStreamContextOrNull()?.sessionModel;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [taking, setTaking] = useState<TakeOverMode | null>(null);
  const [failed, setFailed] = useState(false);

  const takeOver = async (mode: TakeOverMode) => {
    setDialogOpen(false);
    setFailed(false);
    setTaking(mode);
    try {
      const res = await send<{ status?: string; error?: string } | undefined>(
        MessageType.TAKE_OVER_SESSION,
        // What a message sent from this tab would carry: the fallback when the holder cannot say what it runs under.
        { sessionId, mode, inputMode: requestedInputMode ?? undefined, model: sessionModel ?? undefined },
        { timeout: null },
      );
      if (res?.status === 'error') setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setTaking(null);
    }
  };

  const cancelWaiting = () => {
    void send(MessageType.CANCEL_TAKE_OVER_SESSION, { sessionId }).catch(() => undefined);
  };

  return (
    <div role="status" data-testid="held-elsewhere-bar" className="absolute inset-0">
      <InputColumn className="h-full">
        <div className="flex h-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-default/70 bg-surface-hover px-3 py-2">
          <span className="min-w-[min(22rem,100%)] flex-1 break-words text-base leading-normal text-text-primary">
            {taking === 'afterTurn' ? t('takeOver.waiting') : failed ? t('takeOver.failed') : t('takeOver.message')}
          </span>
          <div className="ms-auto flex shrink-0 items-center gap-2">
            {taking === 'afterTurn' && (
              <button type="button" onClick={cancelWaiting} className={BUTTON_CLASS}>
                {t('takeOver.cancelWait')}
              </button>
            )}
            <button
              type="button"
              disabled={taking !== null}
              aria-busy={taking !== null}
              onClick={() => setDialogOpen(true)}
              className={`${BUTTON_INVERTED_CLASS} relative disabled:cursor-default`}
            >
              {/* The label stays (invisible) so the button keeps its width while the spinner takes its place. */}
              <span className={taking !== null ? 'invisible' : undefined}>{t('takeOver.button')}</span>
              {taking !== null && (
                <span
                  data-testid="take-over-spinner"
                  className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin rounded-full border-2 border-surface-base/30 border-t-surface-base"
                />
              )}
            </button>
          </div>
        </div>
      </InputColumn>
      {dialogOpen && <TakeOverDialog sessionId={sessionId} onChoose={(mode) => void takeOver(mode)} onCancel={() => setDialogOpen(false)} />}
    </div>
  );
}

/**
 * The confirmation before a take-over. It asks the holding backend what it is doing and words itself by the answer:
 * a backend at rest, one working, and one waiting for a person's answer are taken over differently (the last one
 * cannot be waited for, since its turn ends only when someone answers there).
 */
function TakeOverDialog({
  sessionId,
  onChoose,
  onCancel,
}: {
  sessionId: string;
  onChoose: (mode: TakeOverMode) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('chat');
  const { send } = useBridge();
  const [holder, setHolder] = useState<Holder | null | undefined>(undefined);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(send<{ holder?: Holder | null } | undefined>(MessageType.GET_SESSION_HOLDER, { sessionId }))
      .then((res) => {
        if (!cancelled) setHolder(res?.holder ?? null);
      })
      .catch(() => {
        if (!cancelled) setHolder(null);
      });
    return () => {
      cancelled = true;
    };
  }, [send, sessionId]);

  useEffect(() => {
    if (holder !== undefined) confirmRef.current?.focus();
  }, [holder]);

  // Taken by the top-most overlay in the capture phase, so it never reaches the key that stops a running response.
  useEscapeLayer(() => {
    onCancel();
    return true;
  });

  const loading = holder === undefined;
  const activity = holder?.activity;
  const running = activity === SessionActivity.Running;
  const awaiting = activity === SessionActivity.Awaiting;
  const message = awaiting ? t('takeOver.dialogAwaiting') : running ? t('takeOver.dialogRunning') : t('takeOver.dialogIdle');

  return (
    <Portal>
      <div
        data-testid="take-over-dialog-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div role="dialog" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border border-border-default bg-surface-raised p-6 shadow-2xl">
          <h2 className="pr-6 text-md font-semibold text-[var(--tr-text)]">{t('takeOver.dialogTitle')}</h2>
          {loading ? (
            <div role="status" className="flex items-center gap-2 text-sm text-[var(--tr-text)]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-primary/30 border-t-text-primary" />
              {t('takeOver.dialogLoading')}
            </div>
          ) : (
            <>
              <p className="whitespace-pre-line text-sm text-[var(--tr-text)]">{message}</p>
              <p className="text-xs text-text-tertiary">{t('takeOver.dialogWhy')}</p>
              {holder && (
                <p data-testid="take-over-holder-detail" className="whitespace-pre-line break-all text-xs text-text-secondary">
                  {t('takeOver.dialogDetail', { folder: holder.workingDir, pid: holder.ownerPid })}
                </p>
              )}
            </>
          )}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--tr-text)] transition-colors hover:bg-surface-tooltip"
              onClick={onCancel}
            >
              {t('takeOver.dialogCancel')}
            </button>
            {!loading && running && (
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--tr-text)] transition-colors hover:bg-surface-tooltip"
                onClick={() => onChoose('afterTurn')}
              >
                {t('takeOver.dialogAfterTurn')}
              </button>
            )}
            <button
              ref={confirmRef}
              type="button"
              disabled={loading}
              className="rounded-lg bg-accent-primary-hover px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary disabled:pointer-events-none disabled:opacity-40"
              onClick={() => onChoose('now')}
            >
              {running ? t('takeOver.dialogNow') : t('takeOver.dialogConfirm')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/**
 * The input of a session another backend holds: still mounted and taking its place, but hidden (`invisible` keeps the
 * layout) and shut to the keyboard and the pointer (`inert`), with the bar laid over it.
 */
export function HeldElsewhereInputSlot({ sessionId, children }: { sessionId: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="invisible" aria-hidden="true" {...({ inert: '' } as object)}>
        {children}
      </div>
      <HeldElsewhereBar sessionId={sessionId} />
    </div>
  );
}
