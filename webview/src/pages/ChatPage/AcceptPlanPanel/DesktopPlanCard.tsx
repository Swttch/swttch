import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Tippy from '@tippyjs/react/headless';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { useSessionContext } from '@/contexts/SessionContext';
import { InputModeValues, type InputMode } from '@/types/chatInput';
import type { PendingPlanApproval } from '../../../hooks/usePendingPlanApproval';

interface Props {
  pending: PendingPlanApproval;
  onApprove: (controlRequestId: string) => void;
  onDeny: (controlRequestId: string, reason?: string) => void;
}

/** The line that names a plan: its first line without the marks of a heading. */
function planTitle(plan: unknown): string {
  if (typeof plan !== 'string') return '';
  const line = plan.split('\n').map((text) => text.trim()).find((text) => text !== '') ?? '';
  return line.replace(/^#+\s*/, '');
}

const BUTTON = 'h-[1.9062rem] rounded-[0.5625rem] px-[0.5625rem] text-[1rem] transition-opacity hover:opacity-80';
const GRAY = `${BUTTON} bg-text-primary/[0.12] text-text-primary`;

/**
 * A plan waiting for its answer, drawn as the desktop app draws it in the views that follow it (#673): a heading
 * with "Claude proposed a plan", what the plan is about and a link that opens it, and under it "Reject", "Revise…",
 * "Accept" and the main button "Accept and use auto mode" with the other ways of accepting behind its arrow.
 * Measured on the desktop app's recording; sizes are in rem so they follow the Font size setting.
 */
export function DesktopPlanCard({ pending, onApprove, onDeny }: Props) {
  const { t } = useTranslation('chat');
  const { setInputMode, availableModes } = useSessionContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  // The desktop app stacks the four buttons one under another when the chat is narrow (its plan pane open beside it).
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const zoom = parseFloat(document.documentElement.style.zoom) || 1;
    const observer = new ResizeObserver(([entry]) => setStacked(entry.contentRect.width / zoom < rem * 30));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const plan = typeof pending.input.plan === 'string' ? pending.input.plan : '';
  const title = useMemo(() => planTitle(pending.input.plan), [pending.input.plan]);

  const accept = useCallback(
    (mode: InputMode) => {
      // The answer first and the mode after it: the CLI drops the request it waits on if the mode changes under it.
      onApprove(pending.controlRequestId);
      setInputMode(mode);
    },
    [onApprove, pending.controlRequestId, setInputMode],
  );
  const autoMode: InputMode = availableModes.includes(InputModeValues.AUTO) ? InputModeValues.AUTO : InputModeValues.AUTO_EDIT;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');
      if (event.key === 'Escape' && !typing) {
        event.preventDefault();
        onDeny(pending.controlRequestId);
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !typing) {
        event.preventDefault();
        accept(autoMode);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [accept, autoMode, onDeny, pending.controlRequestId]);

  const menu: Array<{ key: string; label: string; mode: InputMode; show: boolean }> = [
    { key: 'edits', label: t('acceptPlan.card.acceptEdits'), mode: InputModeValues.AUTO_EDIT, show: availableModes.includes(InputModeValues.AUTO_EDIT) },
    { key: 'auto', label: t('acceptPlan.card.acceptAuto'), mode: InputModeValues.AUTO, show: availableModes.includes(InputModeValues.AUTO) },
    { key: 'bypass', label: t('acceptPlan.card.acceptBypass'), mode: InputModeValues.BYPASS, show: availableModes.includes(InputModeValues.BYPASS) },
  ];

  return (
    <div className="w-full shrink-0 animate-[fadeIn_0.3s_ease-out] px-4 pb-2 pt-[0.375rem]" data-testid="desktop-plan-card">
      <div ref={cardRef} className="flex w-full max-w-[33.4rem] flex-col overflow-hidden rounded-[0.8125rem] border border-text-primary/[0.05]">
        <div className="flex items-start justify-between gap-3 bg-text-primary/[0.04] px-[1.2188rem] pb-[0.84rem] pt-[0.84rem]">
          <div className="min-w-0">
            <div className="text-[0.9rem] leading-[1.25rem] text-text-primary">{t('acceptPlan.card.title')}</div>
            {title && <div className="mt-[0.2rem] truncate text-[0.8461rem] leading-[1.25rem] text-text-secondary">{title}</div>}
          </div>
          {plan && (
            <button
              type="button"
              onClick={() => setPlanOpen((open) => !open)}
              className="shrink-0 text-[0.8461rem] leading-[1.25rem] text-[rgb(94,150,230)] underline decoration-[rgb(94,150,230)]/50 underline-offset-2 hover:opacity-80"
            >
              {t('acceptPlan.card.openPlan')}
            </button>
          )}
        </div>
        {planOpen && (
          <pre className="max-h-[18rem] overflow-y-auto whitespace-pre-wrap break-words border-t border-text-primary/[0.06] px-[1.2188rem] py-[0.9rem] font-sans text-[0.8461rem] leading-[1.35] text-text-primary">
            {plan}
          </pre>
        )}
        {revising ? (
          <div className="flex flex-col gap-[0.6rem] px-[1.0625rem] pb-[1rem] pt-[0.97rem]">
            <textarea
              autoFocus
              rows={2}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  onDeny(pending.controlRequestId, feedback.trim() || undefined);
                }
              }}
              placeholder={t('acceptPlan.card.revisePlaceholder')}
              className="block min-h-[4.2rem] w-full resize-none rounded-[0.5rem] border-2 border-[rgb(52,120,214)] bg-text-primary/[0.03] px-[0.9rem] py-[0.55rem] text-[0.9rem] leading-[1.25rem] text-text-primary placeholder:text-text-secondary focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <button type="button" data-testid="plan-revise-back" onClick={() => setRevising(false)} className={GRAY}>
                {t('acceptPlan.card.back')}
              </button>
              <button
                type="button"
                data-testid="plan-revise-submit"
                onClick={() => onDeny(pending.controlRequestId, feedback.trim() || undefined)}
                className={`${BUTTON} bg-text-primary/[0.92] text-text-inverse`}
              >
                {t('acceptPlan.card.reviseSubmit')}
              </button>
            </div>
          </div>
        ) : (
          <div
            className={
              stacked
                ? 'flex flex-col gap-[0.6rem] px-[1.0625rem] pb-[1rem] pt-[0.97rem] [&>button]:w-full [&>div]:w-full [&>span]:hidden [&>div>button:first-child]:flex-1 [&>div>button:first-child]:justify-center'
                : 'flex flex-wrap items-center gap-[0.75rem] px-[1.0625rem] pb-[0.8rem] pt-[0.97rem]'
            }
          >
          <button type="button" data-testid="plan-reject" onClick={() => onDeny(pending.controlRequestId)} className={GRAY}>
            {t('acceptPlan.card.reject')}
          </button>
          <button type="button" data-testid="plan-revise" onClick={() => setRevising((open) => !open)} className={GRAY}>
            {t('acceptPlan.card.revise')}
          </button>
          <span className="flex-1" />
          <button type="button" data-testid="plan-accept" onClick={() => accept(InputModeValues.ASK_BEFORE_EDIT)} className={GRAY}>
            {t('acceptPlan.card.accept')}
          </button>
          <div className="flex h-[1.9062rem] items-stretch rounded-[0.5625rem] bg-text-primary/[0.92] text-text-inverse">
            <button
              type="button"
              data-testid="plan-accept-auto"
              onClick={() => accept(autoMode)}
              className="flex items-center gap-[0.5rem] rounded-s-[0.5625rem] px-[0.5625rem] text-[1rem] transition-colors hover:bg-black/[0.11]"
            >
              {t('acceptPlan.card.acceptAuto')}
              <span className="flex items-center gap-[0.15rem] text-[0.7rem]">
                <kbd className="rounded border border-black/25 px-[0.2rem] font-sans">⌘</kbd>
                <kbd className="rounded border border-black/25 px-[0.2rem] font-sans">⏎</kbd>
              </span>
            </button>
            <Tippy
              visible={menuOpen}
              interactive
              placement="top-end"
              offset={[0, 6]}
              appendTo={() => document.body}
              onClickOutside={() => setMenuOpen(false)}
              render={(attrs) => (
                <div {...attrs}>
                  <div role="menu" data-testid="plan-menu" className="min-w-[14rem] rounded-xl bg-surface-hover p-1.5 text-text-primary shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
                    {menu.filter((item) => item.show).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        data-testid={`plan-menu-${item.key}`}
                        onClick={() => {
                          setMenuOpen(false);
                          accept(item.mode);
                        }}
                        className="flex w-full rounded-lg px-3 py-2 text-start text-[1rem] font-normal transition-colors hover:bg-text-primary/[0.1]"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            >
              <button
                type="button"
                data-testid="plan-more"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center rounded-e-[0.5625rem] border-s border-black/20 px-[0.5rem] transition-colors hover:bg-black/[0.11]"
              >
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </Tippy>
          </div>
        </div>
        )}
      </div>
      <div data-testid="plan-row-pending" className="flex items-center gap-[0.35rem] py-[0.625rem] ps-[0.2rem] text-[0.9656rem] text-text-secondary">
        <span aria-hidden className="flex gap-[0.15rem] text-[rgb(217,92,76)]">
          <span className="h-[0.25rem] w-[0.25rem] rounded-full bg-current" />
          <span className="h-[0.25rem] w-[0.25rem] rounded-full bg-current" />
          <span className="h-[0.25rem] w-[0.25rem] rounded-full bg-current" />
        </span>
        <span className="min-w-0 truncate">{t('acceptPlan.proposing', { title })}</span>
      </div>
    </div>
  );
}
