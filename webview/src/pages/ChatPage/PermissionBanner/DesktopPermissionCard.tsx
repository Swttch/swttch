import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Tippy from '@tippyjs/react/headless';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useSessionContext } from '@/contexts/SessionContext';
import { InputModeValues } from '@/types/chatInput';
import { sessionRulesFromSuggestions } from '@/shared';
import type { TranscriptViewMode } from '@/types/settings';
import type { PendingPermission } from '../../../hooks/usePendingPermissions';

/**
 * The tools whose permission prompt is drawn as the desktop app draws it, in the views that follow the
 * desktop app (Normal, Thinking, Verbose). Grows one kind of request at a time; the classic chat keeps
 * its own prompt for all of them (#673).
 */
const DESKTOP_CARD_TOOLS = new Set(['Bash', 'PowerShell']);

export function usesDesktopPermissionCard(toolName: string, viewMode: TranscriptViewMode | null): boolean {
  return viewMode !== null && DESKTOP_CARD_TOOLS.has(toolName);
}

/** Stands in for the action in the question while its shape is worked out. No translation contains it. */
const ACTION_MARKER = '\u0000action\u0000';

interface Props {
  permission: PendingPermission;
  /** The request's one-line description, when it has one. */
  subtitle?: string;
  /** What the request would do: the command, as the prompt draws it. */
  preview: ReactNode;
  onApprove: () => void;
  /** Approve and install the narrow rule the CLI suggested, for this session. */
  onApproveAlways: () => void;
  onDeny: () => void;
  /** Escape: not "no to this one" but "stop what you are doing" (deny, and end the turn). */
  onCancel: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
}

/**
 * A permission request drawn as the Claude desktop app draws it: a heading band with the question, what
 * it is about, and two buttons, "Deny" and the allow button with the other ways of allowing behind its arrow.
 *
 * The composer stays under it, as there. What is typed there is an ordinary message and does not answer the
 * card (measured in the desktop app: the message goes up as a new turn and the card stays), so nothing here
 * reads it.
 *
 * Which allow answer leads follows what the CLI offered. "Always allow" installs the narrow rule the CLI
 * suggested, for this session, and exists only when the CLI suggested one it will keep; without one the
 * button that leads is "Allow once".
 */
export function DesktopPermissionCard(props: Props) {
  const { permission, subtitle, preview, onApprove, onApproveAlways, onDeny, onCancel } = props;
  const { t } = useTranslation('chat');
  const { inputMode, availableModes, setInputMode } = useSessionContext();
  const [menuOpen, setMenuOpen] = useState(false);

  const alwaysAvailable =
    !permission.suppressAlwaysAllowRule &&
    sessionRulesFromSuggestions(permission.toolName, permission.suggestions) !== undefined;

  // Switching to Auto is offered from the modes that ask, and only where the CLI allows Auto at all.
  const canSwitchToAuto =
    availableModes.includes(InputModeValues.AUTO) &&
    (inputMode === InputModeValues.ASK_BEFORE_EDIT || inputMode === InputModeValues.AUTO_EDIT);

  const allowAndSwitchToAuto = useCallback(() => {
    // The mode first, so the rest of the session is reviewed from here on, then the answer to this one.
    setInputMode(InputModeValues.AUTO);
    onApprove();
  }, [setInputMode, onApprove]);

  const menuItems: Array<{ key: string; label: string; description?: string; onSelect: () => void }> = [];
  if (alwaysAvailable) {
    menuItems.push({ key: 'once', label: t('permissionBanner.card.allowOnce'), onSelect: onApprove });
  }
  if (canSwitchToAuto) {
    menuItems.push({
      key: 'auto',
      label: t('permissionBanner.card.allowAndSwitchToAuto'),
      description: t('permissionBanner.card.autoReviewsRest'),
      onSelect: allowAndSwitchToAuto,
    });
  }

  const primaryLabel = alwaysAvailable ? t('permissionBanner.card.alwaysAllow') : t('permissionBanner.card.allowOnce');
  const primaryTitle = alwaysAvailable ? t('permissionBanner.card.alwaysAllowHint') : undefined;
  const primaryAction = alwaysAvailable ? onApproveAlways : onApprove;

  // Keys, as the desktop app binds them: Esc stops, Cmd/Ctrl+Enter allows once, and with Shift allows
  // always. Never while the person is typing: Cmd+Enter there is "queue this message".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        if (menuOpen) {
          // Closing the menu uses this Escape: marking it handled keeps the composer's own
          // Escape ("stop the response") from also firing.
          event.preventDefault();
          setMenuOpen(false);
          return;
        }
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !isTypingTarget(event.target)) {
        event.preventDefault();
        if (event.shiftKey) (alwaysAvailable ? onApproveAlways : onApprove)();
        else onApprove();
      }
    };
    // Capture phase: this card must see the key before the composer's window listener, whatever
    // order the two were (re)subscribed in, so "handled" is visible to it.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [menuOpen, onCancel, onApprove, onApproveAlways, alwaysAvailable]);

  const action = t('permissionBanner.card.actionRunCommand');
  const marked = t('permissionBanner.card.question', { action: ACTION_MARKER });
  const at = marked.indexOf(ACTION_MARKER);
  const question =
    at === -1 ? (
      marked
    ) : (
      <>
        {marked.slice(0, at)}
        <b className="font-semibold">{action}</b>
        {marked.slice(at + ACTION_MARKER.length)}
      </>
    );

  return (
    <div className="w-full max-w-[var(--chat-column-max,44rem)] mx-auto px-4 sm:px-[var(--chat-column-px,1rem)] pb-2 pt-2 min-h-0 flex flex-col">
      <div
        data-testid="desktop-permission-card"
        className="rounded-xl border border-border-default bg-surface-base min-h-0 flex flex-col"
      >
        <div className="px-4 py-4 rounded-t-xl bg-surface-raised text-[1rem] text-text-primary">{question}</div>

        <div className="px-4 py-3 min-h-0 overflow-y-auto flex flex-col gap-2">
          {subtitle && <p className="text-[1rem] text-text-secondary">{subtitle}</p>}
          {preview}
        </div>

        <div className="relative flex items-center justify-end gap-2 px-4 pb-4 pt-3">
          <button
            type="button"
            data-testid="permission-deny"
            onClick={onDeny}
            className="rounded-lg bg-surface-hover px-3 py-1.5 text-[1rem] text-text-primary transition-opacity hover:opacity-80"
          >
            {t('permissionBanner.card.deny')}
          </button>

          <div className="relative flex items-stretch rounded-lg bg-text-primary text-text-inverse">
            <Tooltip content={primaryTitle}>
              <button
                type="button"
                data-testid="permission-primary"
                onClick={primaryAction}
                className={`px-3 py-1.5 text-[1rem] font-medium transition-opacity hover:opacity-90 ${
                  menuItems.length > 0 ? 'rounded-s-lg' : 'rounded-lg'
                }`}
              >
                {primaryLabel}
              </button>
            </Tooltip>
            {menuItems.length > 0 && (
              <Tippy
                visible={menuOpen}
                interactive
                placement="bottom-end"
                offset={[0, 6]}
                // Out of the chat's scroll container, so the menu is never clipped by it.
                appendTo={() => document.body}
                onClickOutside={() => setMenuOpen(false)}
                render={(attrs) => (
                  <div {...attrs}>
                    <div
                      role="menu"
                      data-testid="permission-menu"
                      className="min-w-[16rem] max-w-[20rem] rounded-xl border border-border-default bg-surface-raised p-1.5 text-text-primary shadow-lg"
                    >
                      {menuItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          role="menuitem"
                          data-testid={`permission-menu-${item.key}`}
                          onClick={() => {
                            setMenuOpen(false);
                            item.onSelect();
                          }}
                          className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-start transition-colors hover:bg-surface-hover"
                        >
                          <span className="text-[1rem]">{item.label}</span>
                          {item.description && (
                            <span className="text-[0.9230rem] text-text-secondary">{item.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              >
                <button
                  type="button"
                  data-testid="permission-more"
                  aria-label={t('permissionBanner.card.moreAllowOptions')}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex items-center rounded-e-lg border-s border-black/20 px-1.5 transition-opacity hover:opacity-90"
                >
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
              </Tippy>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
