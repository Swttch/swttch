import { useState } from 'react';
import { ChevronLeftIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import { McpServer, McpServerStatus, McpTransportType, canAuthenticate } from '@/shared';
import { useMcpServerTools } from '@/hooks/useMcpServerTools';
import { useTranslation } from '@/i18n';
import { McpStatusBadge } from './McpStatusBadge';

/** Scopes a server can live in that the CLI `add`/`remove` commands can manage. */
const EDITABLE_SCOPES = ['user', 'project', 'local'];

interface Props {
  server: McpServer;
  onBack: () => void;
  onEdit: (server: McpServer) => void;
  onReconnect: (name: string) => Promise<void>;
  onAuthenticate: (name: string) => Promise<{ hint?: string }>;
  onClearAuth: (name: string) => Promise<{ hint?: string }>;
  onToggleEnabled: (name: string, enabled: boolean) => Promise<void>;
  onRemove: (name: string, scope: string) => Promise<void>;
}

export function McpServerDetail(props: Props) {
  const { t } = useTranslation('common');
  const { server, onBack, onEdit, onReconnect, onAuthenticate, onClearAuth, onToggleEnabled, onRemove } = props;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const busy = busyAction !== null;
  const isClaudeAiProxy = server.config?.type === McpTransportType.CLAUDEAI_PROXY;
  const canAuth = canAuthenticate(server);
  // Editable only when we have a transport config we could re-create via the CLI,
  // and the scope is one `claude mcp add/remove` actually manages. claude.ai
  // connectors (claudeai-proxy / null config) are provisioned elsewhere — no Edit.
  const canEdit =
    server.config != null &&
    !isClaudeAiProxy &&
    EDITABLE_SCOPES.includes(server.scope as string);
  const isConnected = server.status === McpServerStatus.CONNECTED;
  const isDisabled = server.status === McpServerStatus.DISABLED;
  const isFailed = server.status === McpServerStatus.FAILED;
  const needsAuth = server.status === McpServerStatus.NEEDS_AUTH;

  // The list already carries the tool list when it came from a running CLI, so
  // asking again would open a second connection to a server whose answer is
  // already on screen. Absent `tools` is the case that still needs asking; an
  // empty array is an answer, not a gap (see McpServer.tools).
  const { data: fetchedTools = [], isFetching: toolsLoading, error: toolsError } = useMcpServerTools(
    server.name,
    server.config,
    isConnected && server.tools === undefined,
  );
  const tools = server.tools ?? fetchedTools;

  async function wrap(action: string, fn: () => Promise<void>): Promise<void> {
    setBusyAction(action);
    setHint(null);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReconnect(): Promise<void> {
    await wrap('reconnect', () => onReconnect(server.name));
  }

  async function handleAuthenticate(): Promise<void> {
    await wrap('authenticate', async () => {
      const result = await onAuthenticate(server.name);
      if (result.hint) setHint(result.hint);
    });
  }

  async function handleClearAuth(): Promise<void> {
    await wrap('clear-auth', async () => {
      const result = await onClearAuth(server.name);
      if (result.hint) setHint(result.hint);
    });
  }

  async function handleToggle(): Promise<void> {
    await wrap('toggle', () => onToggleEnabled(server.name, isDisabled));
  }

  async function handleRemove(): Promise<void> {
    await wrap('remove', () => onRemove(server.name, server.scope as string));
    onBack();
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 pt-4 pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-md text-text-secondary hover:text-text-primary transition-colors"
        >
          <ChevronLeftIcon className="w-6 h-6 rtl:-scale-x-100" />
          <span>{t('mcpModal.detail.backToList')}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-4">
        {/* Error box — above server name,커서 스타일 */}
        {server.error && (
          <div className="p-3 rounded-lg border border-state-error-fg/40 bg-state-error-bg text-sm text-state-error-fg">
            {server.error}
          </div>
        )}

        {/* Unresolved ${VAR} placeholders. Warning rather than error: the server
            may well be running, just configured with the literal placeholder text
            instead of a value — the quiet failure #364 was filed for. */}
        {server.missingVars && server.missingVars.length > 0 && (
          <div className="p-3 rounded-lg border border-state-warning-fg/40 bg-state-warning-bg text-sm text-state-warning-fg">
            {t('mcpModal.detail.missingVars', { vars: server.missingVars.join(', ') })}
          </div>
        )}

        {/* Server header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-mono text-base font-semibold text-text-primary leading-none m-0">{server.name}</h3>
          <div className="flex items-center gap-2">
            <McpStatusBadge status={server.status} />
            {/* Edit chip — badge shape, but button background/border (see onEdit) */}
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(server)}
                disabled={busy}
                className="inline-flex items-center gap-1 text-sm font-medium px-2.5 py-1.5 rounded-md flex-shrink-0 border border-border-default bg-surface-hover text-text-primary hover:bg-surface-raised transition-colors disabled:opacity-50"
              >
                {t('mcpModal.detail.edit')}
              </button>
            )}
          </div>
        </div>

        {/* Config details */}
        {server.config && (
          <div className="text-sm text-text-tertiary space-y-0.5">
            <div>{t('mcpModal.detail.type', { value: server.config.type })}</div>
            {server.config.command && (
              <div className="font-mono truncate">
                {server.config.command}
                {server.config.args?.length ? ' ' + server.config.args.join(' ') : ''}
              </div>
            )}
            {server.config.url && (
              <div className="font-mono truncate">{server.config.url}</div>
            )}
          </div>
        )}

        {/* Hint (terminal instruction) */}
        {hint && (
          <div className="text-sm text-text-secondary bg-surface-hover rounded p-2 font-mono">
            {hint}
          </div>
        )}

        {/* Action buttons — 순서: Authenticate(CTA) → Reconnect → Clear auth → Disable */}
        <div className="flex flex-col gap-4">
          {/* Authenticate — CTA primary, 최상단 */}
          {canAuth && (needsAuth || isFailed) && (
            <ActionButton
              label={t('mcpModal.detail.authenticate')}
              anyBusy={busy}
              activeAction="authenticate"
              busyAction={busyAction}
              onClick={handleAuthenticate}
              variant="primary"
            />
          )}

          {/* Reconnect */}
          {!isDisabled && (
            <ActionButton
              label={t('mcpModal.detail.reconnect')}
              busyLabel={t('mcpModal.detail.reconnecting')}
              anyBusy={busy}
              activeAction="reconnect"
              busyAction={busyAction}
              onClick={handleReconnect}
            />
          )}

          {/* Clear authentication */}
          {canAuth && !isClaudeAiProxy && isConnected && (
            <ActionButton
              label={t('mcpModal.detail.clearAuth')}
              anyBusy={busy}
              activeAction="clear-auth"
              busyAction={busyAction}
              onClick={handleClearAuth}
            />
          )}

          {/* Enable / Disable */}
          <ActionButton
            label={isDisabled ? t('mcpModal.detail.enable') : t('mcpModal.detail.disable')}
            anyBusy={busy}
            activeAction="toggle"
            busyAction={busyAction}
            onClick={handleToggle}
            variant={isDisabled ? 'primary' : 'secondary'}
          />
        </div>

        {/* View tools — from the list when a running CLI reported them, otherwise
            fetched live via MCP tools/list for connected servers */}
        {isConnected && (
          <div>
            {toolsLoading && tools.length === 0 ? (
              <span className="text-sm text-text-tertiary">{t('mcpModal.detail.loadingTools')}</span>
            ) : toolsError ? (
              <span className="text-sm text-state-error-fg">{t('mcpModal.detail.loadToolsError')}</span>
            ) : tools.length > 0 ? (
              <>
                <button
                  className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
                  onClick={() => setToolsOpen((p) => !p)}
                >
                  {toolsOpen ? (
                    <ChevronUpIcon className="w-4 h-4" />
                  ) : (
                    <ChevronDownIcon className="w-4 h-4" />
                  )}
                  {t('mcpModal.detail.viewTools', { count: tools.length })}
                </button>
                {toolsOpen && (
                  <ul className="mt-2 space-y-3.5 ps-8">
                    {tools.map((tool) => (
                      <li key={tool.name} className="list-disc">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-400">{tool.name}</span>
                          {tool.annotations?.readOnly && (
                            <span className="px-1 py-0.5 rounded bg-surface-hover text-text-tertiary">{t('mcpModal.detail.readOnly')}</span>
                          )}
                          {tool.annotations?.destructive && (
                            <span className="px-1 py-0.5 rounded bg-state-error-bg text-state-error-fg">{t('mcpModal.detail.destructive')}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Remove */}
        <div className="pt-2">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">{t('mcpModal.detail.removeConfirm', { name: server.name })}</p>
              <div className="flex gap-2">
                <button
                  className="flex-1 text-xs py-1.5 rounded bg-state-error-bg text-state-error-fg hover:opacity-80 transition-opacity"
                  onClick={handleRemove}
                  disabled={busy}
                >
                  {t('mcpModal.detail.remove')}
                </button>
                <button
                  className="flex-1 text-xs py-1.5 rounded bg-surface-hover text-text-secondary hover:bg-surface-raised transition-colors"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('mcpModal.detail.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="text-xs text-state-error-fg hover:underline underline-offset-2"
              onClick={() => setConfirmDelete(true)}
            >
              {t('mcpModal.detail.removeServer')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  busyLabel?: string;
  anyBusy: boolean;
  activeAction: string;
  busyAction: string | null;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

function ActionButton(props: ActionButtonProps) {
  const { label, busyLabel, anyBusy, activeAction, busyAction, onClick, variant = 'secondary' } = props;
  const isActive = busyAction === activeAction;
  const base = 'text-md py-2.5 rounded border border-border-default transition-colors';
  const disabledCls = anyBusy && !isActive ? 'opacity-50 pointer-events-none' : '';
  const cls =
    variant === 'primary'
      ? `${base} bg-accent-primary text-white hover:opacity-90 ${disabledCls}`
      : `${base} bg-surface-hover text-text-primary hover:bg-surface-raised ${disabledCls}`;
  return (
    <button className={cls} disabled={anyBusy} onClick={onClick}>
      {isActive ? (busyLabel ?? label) : label}
    </button>
  );
}
