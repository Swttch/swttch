import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useFableProbe, shouldProbeFable } from '@/contexts/FableProbeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useModelSwitch } from '@/hooks/useModelSwitch';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { LoadedMessageType } from '@/types';
import {
  findModelForSelection,
  resolveModelInfo,
  resolveModelLabel,
  withFableFallback,
} from '@/types/models';
import type { ModelInfo } from '@/types/slashCommand';
import { useTranslation } from '@/i18n';

export const SWITCH_MODEL_EVENT = 'switch-model';

/**
 * Height bounds for the picker, which grows upward from the composer.
 *
 * Uncapped, a large catalog runs off the top of the window and those rows can
 * be neither scrolled to nor clicked (issue #314). The cap is the smaller of
 * {@link MAX_PANEL_HEIGHT} — matching the sibling command palette, so the two
 * panels open to the same size — and the room actually left above the composer,
 * so a short window shrinks the list instead of hiding its header behind the
 * top bar. {@link MIN_PANEL_HEIGHT} keeps a few rows reachable when there is
 * almost no room at all.
 */
const MAX_PANEL_HEIGHT = 320;
const MIN_PANEL_HEIGHT = 120;
/** Breathing room kept between the panel and the top of the window. */
const VIEWPORT_PADDING = 8;

interface ModelSwitchOverlayProps {
  onClose: () => void;
  /** When set (e.g. from "/model sonnet"), resolve this to a model and switch
   *  immediately; if it matches nothing, the picker just stays open. */
  autoSelectQuery?: string | null;
}

export function ModelSwitchOverlay({ onClose, autoSelectQuery }: ModelSwitchOverlayProps) {
  const { t } = useTranslation('chat');
  const { appendMessage } = useChatStreamContext();
  const switchModel = useModelSwitch();
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

    await switchModel(value);

    onClose();
  }, [models, appendMessage, t, switchModel, onClose]);

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

  // How tall the panel may grow. It opens upward from the composer, so the
  // ceiling is whatever room is left above the composer — not a constant. A
  // fixed cap either wastes a tall window or, in a short one, pushes the panel
  // under the top bar and hides its own header. Measured once per open (and on
  // resize); `null` until measured, which is the first paint only.
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const panel = panelRef.current;
      if (!panel) return;
      // The panel's bottom edge is pinned above the composer and does not move
      // with its height, so the room above it is exactly that edge minus the
      // margin we keep from the top of the window.
      const room = panel.getBoundingClientRect().bottom - VIEWPORT_PADDING;
      setMaxHeight(Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, room)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // Re-measure when the row count changes the panel's own geometry.
  }, [models.length]);

  // Once the list scrolls, the current model is off-screen whenever it sits
  // past the visible rows — the picker would open showing no ticked row and
  // hide which model is running. Bring it into view on open.
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // scrollIntoView is unimplemented in jsdom; guard so tests don't throw.
    selectedRowRef.current?.scrollIntoView?.({ block: 'nearest' });
    // Also runs after maxHeight lands, so the reveal measures the final box.
  }, [currentInfo, maxHeight]);

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '0',
        marginBottom: '12px',
        width: 'calc(100%)',
        // See MAX_PANEL_HEIGHT: capped to the room above the composer so a long
        // catalog scrolls inside the panel instead of running off the top of
        // the window (issue #314). Before the first measurement, fall back to
        // the constant cap rather than opening uncapped.
        maxHeight: `${maxHeight ?? MAX_PANEL_HEIGHT}px`,
        // Column layout so the header keeps its height and the list takes the
        // rest: the scroll belongs to the list alone, otherwise the "select
        // model" header scrolls away with it.
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--panel-bg, #252526)',
        borderRadius: 'var(--panel-radius, 6px)',
        boxShadow: 'var(--panel-shadow, 0 4px 12px rgba(0,0,0,0.3))',
        zIndex: 100,
        border: '1px solid var(--divider-color, #3c3c3c)',
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 pt-1 pb-1.5 px-3 text-[0.9230rem] text-text-tertiary flex items-center justify-between">
        <span>{t('modelSwitch.selectModel')}</span>
        <kbd className="inline-flex items-center px-1.5 py-0.5 bg-surface-tooltip rounded text-text-secondary text-xs font-mono">
          {isMac ? '⌘⇧M' : 'Ctrl+Shift+M'}
        </kbd>
      </div>

      {/* Model list */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-1.5 px-1">
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
              ref={selected ? selectedRowRef : undefined}
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
