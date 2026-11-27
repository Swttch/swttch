import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Tippy from '@tippyjs/react/headless';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useSessionContext } from '@/contexts/SessionContext';
import { InputModeValues } from '@/types/chatInput';
import { alwaysAllowFromSuggestions, alwaysAllowScope, type ClaudeFolder } from '@/shared';
import type { TranscriptViewMode } from '@/types/settings';
import type { PendingPermission } from '../../../hooks/usePendingPermissions';
import { getLastAllowChoice, setLastAllowChoice } from './lastAllowChoice';
import { mcpToolSessionScopeLabel } from '../message-renderers/ToolRenderers/Mcp/humanize';
import { TitleWithFileLink } from './TitleWithFileLink';

/**
 * The tools whose permission prompt is drawn as the desktop app draws it, in the views that follow the
 * desktop app (Normal, Thinking, Verbose). Grows one kind of request at a time; the classic chat keeps
 * its own prompt for all of them (#673).
 */
const DESKTOP_CARD_TOOLS = new Set(['Bash', 'PowerShell', 'Read', 'WebSearch', 'Edit', 'Write']);

/** A page fetch, a sub-agent and any tool of an MCP server use the same card, with the request's input as lines. */
function isOtherCardTool(toolName: string): boolean {
  return toolName === 'WebFetch' || toolName === 'Agent' || toolName === 'Task' || toolName.startsWith('mcp__');
}

export function usesDesktopPermissionCard(toolName: string, viewMode: TranscriptViewMode | null): boolean {
  return viewMode !== null && (DESKTOP_CARD_TOOLS.has(toolName) || isOtherCardTool(toolName));
}

/** `mcp__server__tool` as "tool (server)"; any other name as it is. */
function toolLabel(toolName: string): string {
  const match = /^mcp__(.+?)__(.+)$/.exec(toolName);
  return match ? `${match[2]} (${match[1]})` : toolName;
}

interface Props {
  permission: PendingPermission;
  /** The request's one-line description, when it has one. */
  subtitle?: string;
  /** What the request would do: the command, as the prompt draws it. */
  preview: ReactNode;
  /** Settles once the answer has gone to the CLI (it first hands over what was written under the card). */
  onApprove: () => void | Promise<void>;
  /** Approve and install the narrow rule the CLI suggested, for this session. */
  onApproveAlways: () => void;
  /**
   * Approve a file change as part of "switch to Accept edits", with whatever else that needs from the CLI (the folder
   * a file outside the working directories is in). Plain approval when not given.
   */
  onApproveAcceptEdits?: () => void | Promise<void>;
  /**
   * The request is about a file in this guarded `.claude` folder: the session line then allows that folder (the only
   * rule the CLI honours for it), and there is no "switch to Accept edits", which would not stop it asking.
   */
  claudeFolder?: ClaudeFolder;
  /** Open the review of this file change again. The file name in the heading is the way to it. */
  onOpenReview?: () => void;
  /**
   * Approve and stop asking about this whole tool until the session ends (the classic prompt's "Yes, allow all … this
   * session"). Given only for a request the CLI will keep a rule for; without it the menu offers nothing of the kind.
   */
  onApproveForSession?: () => void;
  /**
   * For a request the CLI will never keep a rule for: turn on "Allow all command in this session" (after its warning)
   * and resolve to whether it was turned on. The request is then allowed, as the warning said all such requests would be.
   * Which sessions and users may turn it on is that switch's own business (it is sponsor-gated beyond one session).
   */
  onEnableSessionAllow?: () => Promise<boolean>;
  /** The warning that goes with {@link onEnableSessionAllow} is on screen: the keys belong to it, not to this card. */
  keyboardPaused?: boolean;
  onDeny: () => void;
}

/** Stands where the file name goes while the heading is translated; no translation can contain it. */
const FILE_MARKER = '\u0000file\u0000';

function fileNameOf(permission: PendingPermission): string {
  const path = typeof permission.input.file_path === 'string' ? permission.input.file_path : '';
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** The menu line that says what "this session" allows: a tool's whole family, not only the request that asked. */
function sessionAllowLabel(
  permission: PendingPermission,
  t: (key: string, values?: Record<string, unknown>) => string,
  claudeFolder?: ClaudeFolder,
): string {
  const { toolName } = permission;
  if (claudeFolder) return t(`permissionBanner.card.sessionAllow.${claudeFolder === 'user' ? 'claudeUserFolder' : 'claudeFolder'}`);
  if (toolName === 'Edit' || toolName === 'Write') return t('permissionBanner.card.sessionAllow.edit');
  if (toolName === 'Bash') return t('permissionBanner.card.sessionAllow.bash');
  if (toolName === 'Read') return t('permissionBanner.card.sessionAllow.read');
  if (toolName.startsWith('mcp__')) {
    return t('permissionBanner.card.sessionAllow.mcp', { scope: mcpToolSessionScopeLabel(toolName) });
  }
  return t('permissionBanner.card.sessionAllow.default', { tool: toolName });
}

function fileChangeQuestionKey(toolName: string): string {
  return toolName === 'Edit' ? 'permissionBanner.card.questionEdit' : 'permissionBanner.card.questionWrite';
}

/** The heading's question, in the words the desktop app asks it with for each kind of request. */
function questionFor(permission: PendingPermission, t: (key: string, values?: Record<string, unknown>) => string): string {
  if (permission.toolName === 'Read') {
    return t('permissionBanner.card.questionRead', { file: fileNameOf(permission) });
  }
  if (permission.toolName === 'Edit' || permission.toolName === 'Write') {
    return t(fileChangeQuestionKey(permission.toolName), { file: fileNameOf(permission) });
  }
  if (permission.toolName === 'WebFetch') {
    const url = typeof permission.input.url === 'string' ? permission.input.url : '';
    let site = url;
    try {
      site = new URL(url).host || url;
    } catch {
      // not a full address: the text as it came
    }
    return t('permissionBanner.card.questionFetch', { site });
  }
  if (permission.toolName === 'Agent' || permission.toolName === 'Task') {
    const description = typeof permission.input.description === 'string' ? permission.input.description : '';
    return t('permissionBanner.card.questionAgent', { description }).trim();
  }
  if (isOtherCardTool(permission.toolName)) {
    return t('permissionBanner.card.questionTool', { tool: toolLabel(permission.toolName) });
  }
  const action = permission.toolName === 'WebSearch' ? 'actionSearchWeb' : 'actionRunCommand';
  return t('permissionBanner.card.question', { action: t(`permissionBanner.card.${action}`) });
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
  const { permission, subtitle, preview, onApprove, onApproveAlways, onApproveForSession, onEnableSessionAllow, keyboardPaused, onDeny } = props;
  const { onApproveAcceptEdits = onApprove, claudeFolder, onOpenReview } = props;
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
    // The answer to this call first and the mode after it: the CLI drops the call it is waiting on when the mode
    // changes under it, so a mode that went first left the command without its answer ("not recorded", then
    // asked again). Measured in this view, and the desktop app's call goes through.
    void Promise.resolve(onApprove()).then(() => setInputMode(InputModeValues.AUTO));
  }, [setInputMode, onApprove]);

  // A file change offers "Always allow" as "switch this session to Accept edits" (the desktop app's menu for an edit says
  // so under it), where the CLI suggested no rule to keep. It answers this request first and changes the mode after.
  // Not for a guarded .claude folder: the CLI keeps asking about it in that mode, and the terminal does not offer it.
  const isFileChange = permission.toolName === 'Edit' || permission.toolName === 'Write';
  const canAcceptEdits =
    isFileChange && !claudeFolder && !alwaysAvailable && inputMode === InputModeValues.ASK_BEFORE_EDIT && availableModes.includes(InputModeValues.AUTO_EDIT);
  const allowAndAcceptEdits = useCallback(() => {
    void Promise.resolve(onApproveAcceptEdits()).then(() => setInputMode(InputModeValues.AUTO_EDIT));
  }, [setInputMode, onApproveAcceptEdits]);

  const alwaysLeads = alwaysAvailable && getLastAllowChoice() === 'always';
  const scope = alwaysAllowScope(permission.toolName, permission.suggestions);
  const scopeLine = scope ? t(`permissionBanner.card.scope.${scope}`) : t('permissionBanner.card.alwaysAllowHint');

  const menuItems: Array<{ key: string; label: string; description?: string; onSelect: () => void }> = [];
  if (alwaysAvailable) {
    // The one that does not lead is in the menu, with where the rule is kept under "Always allow".
    menuItems.push(
      alwaysLeads
        ? {
            key: 'once',
            label: t('permissionBanner.card.allowOnce'),
            onSelect: () => {
              setLastAllowChoice('once');
              onApprove();
            },
          }
        : {
            key: 'always',
            label: t('permissionBanner.card.alwaysAllow'),
            description: scopeLine,
            onSelect: () => {
              setLastAllowChoice('always');
              onApproveAlways();
            },
          },
    );
  }
  if (canAcceptEdits) {
    menuItems.push({
      key: 'acceptEdits',
      label: t('permissionBanner.card.alwaysAllow'),
      description: t('permissionBanner.card.acceptEditsHint'),
      onSelect: allowAndAcceptEdits,
    });
  }
  // "Allow all … this session": the tool's whole family until the session ends, in whatever mode the session is in. On a
  // file change it stands beside "Always allow", which is another answer: that one changes the mode (#761).
  if (onApproveForSession) {
    menuItems.push({
      key: 'session',
      label: sessionAllowLabel(permission, t, claudeFolder),
      description: t(isFileChange && !claudeFolder ? 'permissionBanner.card.sessionAllowEditHint' : 'permissionBanner.card.sessionAllowHint'),
      onSelect: onApproveForSession,
    });
  } else if (onEnableSessionAllow) {
    // The CLI keeps no rule for this request, so the line is "turn the switch on" rather than a rule: it warns first, and
    // only a turned-on switch answers this request and the ones after it.
    menuItems.push({
      key: 'enableSession',
      label: sessionAllowLabel(permission, t),
      description: t('permissionBanner.card.sessionAllowEnableHint'),
      onSelect: () => {
        void onEnableSessionAllow().then((turnedOn) => {
          if (turnedOn) void onApprove();
        });
      },
    });
  }
  if (canSwitchToAuto) {
    menuItems.push({
      key: 'auto',
      label: t('permissionBanner.card.allowAndSwitchToAuto'),
      description: t('permissionBanner.card.autoReviewsRest'),
      onSelect: allowAndSwitchToAuto,
    });
  }

  const primaryLabel = alwaysLeads ? t('permissionBanner.card.alwaysAllow') : t('permissionBanner.card.allowOnce');
  // The hover line says where the rule is kept, as the desktop app's does ("Saves to local project settings").
  const primaryTitle = alwaysLeads ? scopeLine : undefined;
  const primaryAction = alwaysLeads
    ? () => {
        setLastAllowChoice('always');
        onApproveAlways();
      }
    : () => {
        setLastAllowChoice('once');
        onApprove();
      };

  // Keys, as the desktop app binds them: Esc denies, Cmd/Ctrl+Enter allows once, and with Shift takes "Always
  // allow" (on a file change, the one that switches to Accept edits). Never while the person is typing: Cmd+Enter there is "queue this message".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keyboardPaused) return;
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
        if (!event.shiftKey) onApprove();
        else if (alwaysAvailable) onApproveAlways();
        else if (canAcceptEdits) allowAndAcceptEdits();
        else onApprove();
      }
    };
    // Capture phase: this card must see the key before the composer's window listener, whatever
    // order the two were (re)subscribed in, so "handled" is visible to it.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [menuOpen, onDeny, onApprove, onApproveAlways, alwaysAvailable, canAcceptEdits, allowAndAcceptEdits, keyboardPaused]);

  const fileName = isFileChange ? fileNameOf(permission) : '';
  const question =
    onOpenReview && fileName ? (
      <TitleWithFileLink
        template={t(fileChangeQuestionKey(permission.toolName), { file: FILE_MARKER })}
        marker={FILE_MARKER}
        file={fileName}
        onOpen={onOpenReview}
      />
    ) : (
      questionFor(permission, t)
    );

  return (
    <div className="w-full animate-[fadeIn_0.3s_ease-out] px-4 pb-2 pt-[0.375rem] shrink-0 flex flex-col">
      <div
        data-testid="desktop-permission-card"
        // 535px (482 on screen), a 1px border one faint step lighter than the page (0.05: the 2-row blur of a 1px line hid half of it in the recording), 13px corners.
        className="w-full max-w-[33.4375rem] overflow-hidden rounded-[0.8125rem] border border-text-primary/[0.05] flex flex-col"
      >
        {/* The heading band: 54px (49 on screen), one step lighter than the page, the text in one weight. */}
        {/* The question is one flex item, so a link inside the sentence keeps the spaces around it. */}
        <div className="flex h-[3.375rem] shrink-0 items-center bg-text-primary/[0.04] px-[1.2188rem] text-[0.9rem] text-text-primary">
          <span className="min-w-0">{question}</span>
        </div>

        <div
          className={
            'flex flex-col px-[1.125rem] pt-[0.75rem] ' +
            // The command box is drawn by the shared preview; here it keeps this app's own fill and takes the
            // desktop app's size: 15px by 6.9px inside, the command in 13px.
            '[&_[data-testid=permission-command]]:rounded-[0.625rem] [&_[data-testid=permission-command]]:px-[0.9375rem] ' +
            '[&_[data-testid=permission-command]]:py-[0.4313rem] [&_[data-testid=permission-command]]:text-[0.9rem] ' +
            '[&_[data-testid=permission-command]]:leading-[1.5]'
          }
        >
          {subtitle && <p className="pb-[0.625rem] text-[0.9rem] leading-[1.5] text-text-secondary">{subtitle}</p>}
          {/* A long file or command scrolls here, so the question, its description and the buttons stay on screen
              (#761): 400px of the desktop app's, less in a short window. A block, not a flex column, which would squeeze
              the content to fit instead of scrolling it. */}
          <div data-testid="permission-preview-scroll" className="max-h-[min(27.7778rem,45vh)] overflow-y-auto">
            {preview}
          </div>
        </div>

        {/* 24px under a command's box; 5px more under the value box of a read or a web search (measured on the desktop app). */}
        <div className={`relative flex items-center justify-end gap-[1.125rem] px-[1.125rem] pb-[1.125rem] ${permission.toolName === 'Read' || permission.toolName === 'WebSearch' ? 'pt-[1.85rem]' : permission.toolName === 'Edit' || permission.toolName === 'Write' ? 'pt-[1.6687rem]' : 'pt-[1.5rem]'}`}>
          <button
            type="button"
            data-testid="permission-deny"
            onClick={onDeny}
            className="h-[1.9062rem] rounded-[0.5625rem] bg-text-primary/[0.12] px-[0.5625rem] text-[1rem] text-text-primary transition-colors hover:bg-text-primary/[0.2]"
          >
            {t('permissionBanner.card.deny')}
          </button>

          <Tooltip content={primaryTitle} desktop="large">
          <div className="relative flex h-[1.9062rem] items-stretch rounded-[0.5625rem] bg-text-primary/[0.92] text-text-inverse">
              <button
                type="button"
                data-testid="permission-primary"
                onClick={primaryAction}
                className={`px-[0.5625rem] text-[1rem] transition-colors hover:bg-black/[0.11] ${
                  menuItems.length > 0 ? 'rounded-s-[9px]' : 'rounded-[0.5625rem]'
                }`}
              >
                {primaryLabel}
              </button>
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
                      className="min-w-[16rem] max-w-[20rem] rounded-xl bg-surface-hover p-1.5 text-text-primary shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
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
                          className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-start font-normal transition-colors hover:bg-text-primary/[0.14]"
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
                  className="flex items-center rounded-e-[9px] border-s border-black/20 px-[0.4875rem] transition-colors hover:bg-black/[0.11]"
                >
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
              </Tippy>
            )}
          </div>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
