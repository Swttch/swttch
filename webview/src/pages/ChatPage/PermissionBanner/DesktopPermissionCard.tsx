import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Tippy from '@tippyjs/react/headless';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useSessionContext } from '@/contexts/SessionContext';
import { InputModeValues } from '@/types/chatInput';
import { alwaysAllowFromSuggestions, alwaysAllowScope } from '@/shared';
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
  const { permission, subtitle, preview, onApprove, onApproveAlways, onDeny } = props;
  const { t } = useTranslation('chat');
  const { inputMode, availableModes, setInputMode } = useSessionContext();
  const [menuOpen, setMenuOpen] = useState(false);

  const alwaysAvailable =
    !permission.suppressAlwaysAllowRule &&
    alwaysAllowFromSuggestions(permission.toolName, permission.suggestions) !== undefined;

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
  // The hover line says where the rule is kept, as the desktop app's does ("Saves to local project settings").
  const scope = alwaysAllowScope(permission.toolName, permission.suggestions);
  const primaryTitle = alwaysAvailable
    ? scope
      ? t(`permissionBanner.card.scope.${scope}`)
      : t('permissionBanner.card.alwaysAllowHint')
    : undefined;
  const primaryAction = alwaysAvailable ? onApproveAlways : onApprove;

  // Keys, as the desktop app binds them: Esc denies, Cmd/Ctrl+Enter allows once, and with Shift allows
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
        onDeny();
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
  }, [menuOpen, onDeny, onApprove, onApproveAlways, alwaysAvailable]);

  const question = t('permissionBanner.card.question', { action: t('permissionBanner.card.actionRunCommand') });

  return (
    <div className="w-full px-4 pb-2 pt-[6px] shrink-0 flex flex-col">
      <div
        data-testid="desktop-permission-card"
        // 535px (482 on screen), a 1px border one faint step lighter than the page (0.05: the 2-row blur of a 1px line hid half of it in the recording), 13px corners.
        className="w-full max-w-[535px] overflow-hidden rounded-[13px] border border-text-primary/[0.05] flex flex-col"
      >
        {/* The heading band: 54px (49 on screen), one step lighter than the page, the text in one weight. */}
        <div className="flex h-[54px] shrink-0 items-center bg-text-primary/[0.04] px-[19.5px] text-[0.9rem] text-text-primary">
          {question}
        </div>

        <div
          className={
            'flex flex-col px-[18px] pt-[12px] ' +
            // The command box is drawn by the shared preview; here it keeps this app's own fill and takes the
            // desktop app's size: 15px by 6.9px inside, the command in 13px.
            '[&_[data-testid=permission-command]]:rounded-[10px] [&_[data-testid=permission-command]]:px-[15px] ' +
            '[&_[data-testid=permission-command]]:py-[6.9px] [&_[data-testid=permission-command]]:text-[0.9rem] ' +
            '[&_[data-testid=permission-command]]:leading-[1.5]'
          }
        >
          {subtitle && <p className="pb-[10px] text-[0.9rem] leading-[1.5] text-text-secondary">{subtitle}</p>}
          {preview}
        </div>

        <div className="relative flex items-center justify-end gap-[18px] px-[18px] pb-[18px] pt-[24px]">
          <button
            type="button"
            data-testid="permission-deny"
            onClick={onDeny}
            className="h-[30.5px] rounded-[9px] bg-text-primary/[0.12] px-[9px] text-[1rem] text-text-primary transition-opacity hover:opacity-80"
          >
            {t('permissionBanner.card.deny')}
          </button>

          <div className="relative flex h-[30.5px] items-stretch rounded-[9px] bg-text-primary/[0.92] text-text-inverse">
            <Tooltip content={primaryTitle}>
              <button
                type="button"
                data-testid="permission-primary"
                onClick={primaryAction}
                className={`px-[9px] text-[1rem] transition-colors hover:bg-black/[0.11] ${
                  menuItems.length > 0 ? 'rounded-s-[9px]' : 'rounded-[9px]'
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
                  className="flex items-center rounded-e-[9px] border-s border-black/20 px-[7.8px] transition-colors hover:bg-black/[0.11]"
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
