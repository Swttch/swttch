import { useCallback, useEffect, useRef } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useBridge } from '@/hooks/useBridge';
import { useSessionContext } from '@/contexts/SessionContext';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useFableProbe, shouldProbeFable } from '@/contexts/FableProbeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { LoadedMessageType } from '@/types';
import {
  findModelForSelection,
  resolveModelInfo,
  resolveModelLabel,
  withFableFallback,
} from '@/types/models';
import type { ModelInfo } from '@/types/slashCommand';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

export const SWITCH_MODEL_EVENT = 'switch-model';

interface ModelSwitchOverlayProps {
  onClose: () => void;
  /** When set (e.g. from "/model sonnet"), resolve this to a model and switch
   *  immediately; if it matches nothing, the picker just stays open. */
  autoSelectQuery?: string | null;
}

export function ModelSwitchOverlay({ onClose, autoSelectQuery }: ModelSwitchOverlayProps) {
  const { t } = useTranslation('chat');
  const { setSessionModel, appendMessage } = useChatStreamContext();
  const { send } = useBridge();
  const { currentSessionId } = useSessionContext();
  const { controlResponse } = useCliConfig();
  const currentModel = useCurrentModel();
  const { cliVersion } = useVersionInfo();
  const { probedAvailable, probeFableAvailability } = useFableProbe();
  const { workingDirectory } = useWorkingDir();
  const panelRef = useRef<HTMLDivElement>(null);

  const rawModels: ModelInfo[] = controlResponse?.response?.response?.models ?? [];
  const models: ModelInfo[] = withFableFallback(rawModels, cliVersion, probedAvailable);
  // No default fallback: if we can't identify the running model, no row is
  // ticked — better than ticking "Default" and claiming a selection the user
  // never made (issue #217).
  const currentInfo = resolveModelInfo(models, currentModel, { allowDefaultFallback: false });
  const isMac = navigator.platform.toUpperCase().includes('MAC');

  // Past the promo window the catalog omits Fable for many accounts that can
  // still run `--model fable`, so probe (once, non-blocking) whether THIS account
  // keeps access and, if so, re-offer it. The probe is cached backend-side, so an
  // open per session is cheap. Inside the window, or when the catalog already
  // serves Fable, `shouldProbeFable` returns false and we skip it.
  const shouldProbe = shouldProbeFable(rawModels, cliVersion);
  const probeFiredRef = useRef(false);
  useEffect(() => {
    if (!shouldProbe || probeFiredRef.current) return;
    probeFiredRef.current = true;
    void probeFableAvailability(workingDirectory ?? undefined);
  }, [shouldProbe, workingDirectory, probeFableAvailability]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleSelect = useCallback(async (value: string) => {
    setSessionModel(value);

    // Instant local feedback (same label & dedup behavior as the rotate path):
    // the CLI's `/model` echo only appears on the next send, so this shows the
    // change immediately; UserMessageRenderer dedupes the echo against it.
    const info = models.find((m) => m.value === value);
    appendMessage({
      type: LoadedMessageType.Notification,
      uuid: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      summary: t('modelSwitch.setModelTo', { model: info ? resolveModelLabel(info) : value }),
      modelChangeValue: value,
    });

    if (currentSessionId) {
      await send(MessageType.SET_MODEL, { model: value });
    }

    onClose();
  }, [setSessionModel, models, appendMessage, t, currentSessionId, send, onClose]);

  // "/model <name>": resolve the typed name to a model and switch immediately.
  // Guarded to fire once per open; on no match the picker stays open so the
  // user can choose manually.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (!autoSelectQuery || models.length === 0) return;
    autoSelectedRef.current = true;
    // Exact/family match only (no default fallback): if the named model isn't
    // available we leave the picker open instead of switching to Opus/default.
    const info = findModelForSelection(models, autoSelectQuery);
    if (info) void handleSelect(info.value);
  }, [autoSelectQuery, models, handleSelect]);

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '0',
        marginBottom: '12px',
        width: 'calc(100%)',
        backgroundColor: 'var(--panel-bg, #252526)',
        borderRadius: 'var(--panel-radius, 6px)',
        boxShadow: 'var(--panel-shadow, 0 4px 12px rgba(0,0,0,0.3))',
        zIndex: 100,
        border: '1px solid var(--divider-color, #3c3c3c)',
      }}
    >
      {/* Header */}
      <div className="pt-1 pb-1.5 px-3 text-[0.9230rem] text-text-tertiary flex items-center justify-between">
        <span>{t('modelSwitch.selectModel')}</span>
        <kbd className="inline-flex items-center px-1.5 py-0.5 bg-surface-tooltip rounded text-text-secondary text-xs font-mono">
          {isMac ? '⌘⇧M' : 'Ctrl+Shift+M'}
        </kbd>
      </div>

      {/* Model list */}
      <div className="pb-1.5 px-1">
        {models.length === 0 ? (
          <div className="px-2 py-1 text-[0.9230rem] text-text-tertiary">{t('modelSwitch.loadingModels')}</div>
        ) : models.map((m, i) => {
          // Compare the row itself, not its `value`: a proxy catalog can map two
          // slots onto one model id — the same `value` listed as both "Custom
          // Sonnet model" and "Custom Haiku model" — and comparing values ticks
          // both rows.
          const selected = m === currentInfo;
          return (
            <button
              // `value` is the string we hand the CLI, not an identity within
              // this list — a proxy catalog can list one id in two slots, and a
              // duplicated key makes React reuse the wrong row.
              key={i}
              onClick={() => void handleSelect(m.value)}
              className={`w-full relative flex items-center justify-between px-2 py-1 rounded-md text-start transition-colors ${
                selected ? 'bg-surface-pressed' : 'hover:bg-surface-hover'
              }`}
            >
              <span className="flex flex-col min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="leading-tight text-[1rem] truncate text-text-primary">
                    {m.displayName}
                  </span>
                </span>
                <span className="leading-normal text-[0.8461rem] truncate text-text-secondary/80">
                  {m.description}
                </span>
              </span>
              {selected && (
                <CheckIcon className="absolute end-4 top-1/2 -translate-y-1/2 w-4 h-4 flex-shrink-0 text-text-secondary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
