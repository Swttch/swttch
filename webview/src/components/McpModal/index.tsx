import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { XMarkIcon, PlusIcon, ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import { McpServer, McpRegistryServer } from '@/shared';
import { ParsedMcpServer } from '@/utils/parseMcpJson';
import { useMcpServers } from '@/hooks/useMcpServers';
import { registryServerToPrefill } from '@/hooks/useMcpRegistry';
import { McpServerList } from './McpServerList';
import { McpServerDetail } from './McpServerDetail';
import { McpAddForm } from './McpAddForm';
import { McpMarketplace } from './McpMarketplace';

interface Props {
  onClose: () => void;
}

type View =
  | { kind: 'list' }
  | { kind: 'detail'; name: string }
  | { kind: 'add'; prefill?: { name: string; json: string } }
  | { kind: 'edit'; name: string }
  | { kind: 'marketplace' };

export function McpModal(props: Props) {
  const { onClose } = props;
  const { t } = useTranslation('common');
  const { servers, configPath, loading, refreshing, error, fetch, reconnect, setEnabled, addServer, removeServer, authenticate, clearAuth } = useMcpServers();

  const [view, setView] = useState<View>({ kind: 'list' });
  // While an add/edit submit is in flight, the whole modal is locked: no input
  // edits, no closing, no other actions. The form reports its busy state here.
  const [formBusy, setFormBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap for the lifetime of the modal. The chat input underneath runs
  // auto-focus timers (session change, window focus, …) that pull focus to
  // its textarea, and the window-focus one fires while activeElement is
  // document.body — where focus lands after a click on a non-focusable area
  // inside this modal. Without a trap, coming back to the window after such a
  // click yanks focus to the background composer. Mirrors ConfirmDialog:
  // remember the opener, pull focus back if it escapes while open, and
  // restore it on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) {
        dialog.focus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (formBusy) return; // locked while a save is in flight
        if (view.kind !== 'list') {
          setView({ kind: 'list' });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, view, formBusy]);

  function handleSelect(nameOrSpecial: string): void {
    if (nameOrSpecial === '__add__') {
      setView({ kind: 'add' });
    } else {
      setView({ kind: 'detail', name: nameOrSpecial });
    }
  }

  function getSelectedServer(): McpServer | null {
    if (view.kind !== 'detail') return null;
    return servers.find((s) => s.name === view.name) ?? null;
  }

  async function handleReconnect(name: string): Promise<void> {
    await reconnect(name);
    await fetch();
  }

  async function handleToggle(name: string, enabled: boolean): Promise<void> {
    await setEnabled(name, enabled);
    await fetch();
  }

  async function handleRemove(name: string, scope: string): Promise<void> {
    await removeServer(name, scope);
    setView({ kind: 'list' });
    await fetch();
  }

  /**
   * Edit = replace an existing server. The CLI has no `mcp edit`, so the
   * equivalent is `remove` then `add-json` (also how a CLI user would do it).
   * Name and scope may change here too, which naturally covers rename / move.
   * If the re-add fails, the original config is added back so a failed edit
   * never leaves the user with a deleted server.
   */
  async function handleEdit(
    original: McpServer,
    serversFromForm: ParsedMcpServer[],
    newScope: string,
  ): Promise<void> {
    if (serversFromForm.length !== 1) {
      throw new Error(t('mcpModal.editReplaceSingle'));
    }
    const next = serversFromForm[0];
    const oldName = original.name;
    const oldScope = original.scope as string;
    const oldConfig = original.config as unknown as Record<string, unknown> | null;

    await removeServer(oldName, oldScope);
    try {
      await addServer(next.name, next.config, newScope);
    } catch (err) {
      // Roll back: re-add the original so the edit didn't destroy the server.
      if (oldConfig) {
        try {
          await addServer(oldName, oldConfig, oldScope);
        } catch {
          /* best-effort restore; surface the original failure below */
        }
      }
      await fetch();
      throw err instanceof Error ? err : new Error(String(err));
    }
    await fetch();
    toast.success(t('mcpModal.saved', { name: next.name }));
    setView({ kind: 'list' });
  }

  async function handleAdd(serversToAdd: ParsedMcpServer[], scope: string): Promise<void> {
    const failures: string[] = [];
    for (const s of serversToAdd) {
      try {
        await addServer(s.name, s.config, scope);
      } catch (err) {
        failures.push(`${s.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await fetch();
    if (failures.length > 0) {
      // Some (or all) failed — keep the form open so the user can fix and retry.
      // Servers that succeeded are already reflected by the refetch above.
      throw new Error(
        `${t('mcpModal.addFailed', { failed: failures.length, total: serversToAdd.length })}\n${failures.join('\n')}`,
      );
    }
    serversToAdd.forEach((s) => toast.success(t('mcpModal.added', { name: s.name })));
    setView({ kind: 'list' });
  }

  function handlePick(server: McpRegistryServer): void {
    // Marketplace → Add form: pre-fill name + config JSON, let the user fill any
    // required env/secret values, then add via the same `claude mcp add-json` path.
    setView({ kind: 'add', prefill: registryServerToPrefill(server) });
  }

  const selectedServer = getSelectedServer();
  const editServer = view.kind === 'edit' ? servers.find((s) => s.name === view.name) ?? null : null;
  const ownHeaderView = view.kind === 'add' || view.kind === 'edit' || view.kind === 'marketplace';

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (formBusy) return; // locked while a save is in flight
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div ref={dialogRef}
             tabIndex={-1}
             className={`w-full max-w-lg bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none ${formBusy ? 'pointer-events-none' : ''}`}
             style={{ maxHeight: '50rem', minHeight: '32rem' }}>
          {/* Header */}
          {!ownHeaderView && (
            <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
              <h2 className="text-lg font-semibold text-text-primary">{t('mcpModal.title')}</h2>

              <div className="flex items-center gap-1">
                {view.kind === 'list' && (
                  <button
                    onClick={() => void fetch()}
                    disabled={refreshing}
                    className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors disabled:hover:bg-transparent"
                    title={t('mcpModal.refreshServers')}
                  >
                    <ArrowPathIcon className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {view.kind === 'list' && (
                  <button
                    onClick={() => setView({ kind: 'marketplace' })}
                    className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors"
                    title={t('mcpModal.browseRegistry')}
                  >
                    <MagnifyingGlassIcon className="w-5 h-5" />
                  </button>
                )}
                {view.kind === 'list' && (
                  <button
                    onClick={() => setView({ kind: 'add' })}
                    className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors"
                    title={t('mcpModal.addServer')}
                  >
                    <PlusIcon className="w-5 h-5" />
                  </button>
                )}
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors"
                  >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* loading/error reflect the configured-servers list — not the
                marketplace or add form, which manage their own state. */}
            {!ownHeaderView && loading && (
              <div className="flex-1 flex items-center justify-center text-md text-text-tertiary">
                {t('mcpModal.checkingHealth')}
              </div>
            )}
            {!ownHeaderView && !loading && error && (
              <div className="flex-1 flex items-center justify-center px-4">
                <p className="text-sm text-state-error-fg text-center">{error}</p>
              </div>
            )}
            {!loading && !error && view.kind === 'list' && (
              <McpServerList servers={servers} configPath={configPath} onSelect={handleSelect} />
            )}
            {!loading && !error && view.kind === 'detail' && selectedServer && (
              <McpServerDetail
                server={selectedServer}
                onBack={() => setView({ kind: 'list' })}
                onEdit={(s) => setView({ kind: 'edit', name: s.name })}
                onReconnect={handleReconnect}
                onAuthenticate={authenticate}
                onClearAuth={clearAuth}
                onToggleEnabled={handleToggle}
                onRemove={handleRemove}
              />
            )}
            {!loading && !error && view.kind === 'detail' && !selectedServer && (
              <div className="flex-1 flex items-center justify-center text-md text-text-tertiary">
                {t('mcpModal.serverNotFound')}
              </div>
            )}
            {view.kind === 'marketplace' && (
              <McpMarketplace onPick={handlePick} onBack={() => setView({ kind: 'list' })} />
            )}
            {view.kind === 'add' && (
              <McpAddForm
                key={view.prefill?.json ?? 'blank'}
                initialName={view.prefill?.name}
                initialJson={view.prefill?.json}
                onAdd={handleAdd}
                onCancel={() => setView({ kind: 'list' })}
                onBusyChange={setFormBusy}
              />
            )}
            {view.kind === 'edit' && editServer && (
              <McpAddForm
                key={`edit-${editServer.name}`}
                mode="edit"
                initialName={editServer.name}
                initialScope={editServer.scope as string}
                initialJson={JSON.stringify(editServer.config, null, 2)}
                onAdd={(parsed, scope) => handleEdit(editServer, parsed, scope)}
                onCancel={() => setView({ kind: 'detail', name: editServer.name })}
                onBusyChange={setFormBusy}
              />
            )}
            {view.kind === 'edit' && !editServer && (
              <div className="flex-1 flex items-center justify-center text-md text-text-tertiary">
                {t('mcpModal.serverNotFound')}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-5 border-t border-border-default">
            <a
              href="https://docs.anthropic.com/en/docs/claude-code/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-text-tertiary hover:text-text-secondary underline underline-offset-2"
            >
              {t('mcpModal.learnMore')}
            </a>
          </div>
        </div>
      </div>
    </Portal>
  );
}
