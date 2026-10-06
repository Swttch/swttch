import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { EffortIcon, EffortSlider } from '@/components/EffortSlider';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';
import { useEffortStepper } from '@/hooks/useEffortStepper';
import { getCaretOffset, setCaretOffset } from '@/utils/domSelection';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useFableProbe, shouldProbeFable } from '@/contexts/FableProbeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useModelSwitch } from '@/hooks/useModelSwitch';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { LoadedMessageType } from '@/types';
import { modelChangeLabel } from '@/pages/ChatPage/modelChangeLabel';
import {
  findModelForSelection,
  resolveModelInfo,
  resolveModelRowText,
  withFableFallback,
} from '@/types/models';
import { ModelInfo } from '@/types/slashCommand';
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

/** One entry of the header's key guide: the keys, then what they do. */
function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <kbd className="inline-flex items-center px-1.5 py-0.5 bg-surface-tooltip rounded text-text-secondary text-xs font-mono">
        {keys}
      </kbd>
      <span>{label}</span>
    </span>
  );
}

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
  const { probedAvailable, probedCanonicalModel, probeFableAvailability } = useFableProbe();
  const { workingDirectory } = useWorkingDir();
  const panelRef = useRef<HTMLDivElement>(null);

  const rawModels: ModelInfo[] = controlResponse?.response?.response?.models ?? [];
  const models: ModelInfo[] = withFableFallback(rawModels, cliVersion, probedAvailable, probedCanonicalModel);

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

  // Escape belongs to this panel while it is open, and the composer must not see it:
  // there it means "stop the stream" (see useEscapeLayer).
  useEscapeLayer(() => {
    onClose();
    return true;
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Focus moves into the panel when it opens (arrow keys work from there) and goes
  // back to whatever held it before when the panel closes. That may well not be the
  // composer, so it is recorded here rather than assumed.
  // Recorded before the first focus move, together with the caret: focusing a
  // contenteditable puts the caret at the start, so where it was has to be kept.
  const [previous] = useState(() => {
    const active = document.activeElement;
    const element = active instanceof HTMLElement ? active : null;
    return { element, caret: element?.isContentEditable ? getCaretOffset(element) : null };
  });
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // StrictMode runs this effect as mount, cleanup, mount. The cleanup below schedules the
    // hand-back, so a mount that follows it means the panel never closed: cancel it.
    if (restoreTimerRef.current) {
      clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
    const { element: target, caret } = previous;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      // Deferred, not done inside the key press that closed the panel: an Enter that
      // reaches a freshly focused composer would send the message.
      restoreTimerRef.current = setTimeout(() => {
        restoreTimerRef.current = null;
        if (!target || !target.isConnected) return;
        target.focus({ preventScroll: true });
        if (caret !== null) setCaretOffset(target, caret);
      }, 0);
    };
  }, [previous]);

  const handleSelect = useCallback(async (value: string, closeAfter = false) => {
    // Instant local feedback (same label & dedup behavior as the rotate path):
    // the CLI's `/model` echo only appears on the next send, so this shows the
    // change immediately; UserMessageRenderer dedupes the echo against it.
    const info = models.find((m) => m.value === value);
    appendMessage({
      type: LoadedMessageType.Notification,
      uuid: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      summary: t('modelSwitch.setModelTo', { model: info ? modelChangeLabel(info) : value }),
      modelChangeValue: value,
    });

    await switchModel(value);

    // Choosing a model leaves the panel open so the effort can be set right after.
    // Only "/model <name>", which names the model up front and shows no choice, closes it.
    if (closeAfter) onClose();
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
    if (info) void handleSelect(info.value, true);
  }, [autoSelectQuery, models, handleSelect]);

  // Keyboard focus is only a highlight: the row looks hovered, Enter acts as a click.
  // It starts on the running model and follows the mouse when the mouse moves.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  useEffect(() => {
    if (focusedIndex !== null || models.length === 0) return;
    const at = currentInfo ? models.indexOf(currentInfo) : -1;
    setFocusedIndex(at >= 0 ? at : 0);
  }, [focusedIndex, models, currentInfo]);

  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const moveFocus = (delta: -1 | 1) => {
    if (models.length === 0) return;
    const next = Math.max(0, Math.min(models.length - 1, (focusedIndex ?? 0) + delta));
    setFocusedIndex(next);
    // jsdom does not implement scrollIntoView.
    rowRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
  };

  const effort = useEffortStepper();

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Composing text (IME) or a modified key is not ours.
    if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-1);
        return;
      case 'ArrowLeft':
        if (!effort.supportsEffort) return;
        e.preventDefault();
        effort.stepBy(-1);
        return;
      case 'ArrowRight':
        if (!effort.supportsEffort) return;
        e.preventDefault();
        effort.stepBy(1);
        return;
      case 'Enter': {
        const row = focusedIndex === null ? undefined : models[focusedIndex];
        if (!row) return;
        e.preventDefault();
        // A held Enter must not fire a switch per repeat.
        if (e.repeat) return;
        void handleSelect(row.value);
        return;
      }
    }
  };

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
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // scrollIntoView is unimplemented in jsdom; guard so tests don't throw.
    selectedRowRef.current?.scrollIntoView?.({ block: 'nearest' });
    // Also runs after maxHeight lands, so the reveal measures the final box.
  }, [currentInfo, maxHeight]);

  return (
    <div
      ref={panelRef}
      // Focusable by script only: the panel takes focus on open so the arrow keys land here.
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        outline: 'none',
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
      {/* Header: the title, and the keys that work in this panel, in the order a user needs
          them. The arrows for effort are listed only when the model has effort levels. */}
      <div className="flex-shrink-0 pt-1 pb-1.5 px-3 text-[0.9230rem] text-text-tertiary flex items-center justify-between gap-3">
        <span className="flex-shrink-0">{t('modelSwitch.selectModel')}</span>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[0.7692rem]">
          <ShortcutHint keys={isMac ? '⌘⇧M' : 'Ctrl+Shift+M'} label={t('modelSwitch.hintOpen')} />
          <ShortcutHint keys="↑↓" label={t('modelSwitch.hintMoveModel')} />
          {effort.supportsEffort && <ShortcutHint keys="←→" label={t('modelSwitch.hintChangeEffort')} />}
        </div>
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
          const focused = i === focusedIndex;
          // Written from the row rather than read off it: a remapped slot
          // advertises a model it does not run (see resolveModelRowText).
          const { title, blurb } = resolveModelRowText(m);
          return (
            <button
              // `value` is the string we hand the CLI, not an identity within
              // this list — a proxy catalog can list one id in two slots, and a
              // duplicated key makes React reuse the wrong row.
              key={i}
              ref={(el) => {
                rowRefs.current[i] = el;
                if (selected) selectedRowRef.current = el;
              }}
              // Rows never take focus, by Tab or by click: it stays on the panel so Enter
              // and the arrow keys always reach one handler.
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => { if (!focused) setFocusedIndex(i); }}
              onClick={() => { setFocusedIndex(i); void handleSelect(m.value); }}
              // The focused row (arrow keys, or the mouse, which moves the focus) gets the same
              // highlight as the command palette's active row: --surface-selected is clearly
              // visible where --surface-hover differs from the panel by only 5 of 255. The running
              // model keeps its own fill and its check while the focus is elsewhere.
              className={`w-full relative flex items-center justify-between px-2 py-1 rounded-md text-start transition-colors ${
                focused
                  ? 'bg-[var(--surface-selected)]'
                  : selected ? 'bg-surface-pressed' : 'hover:bg-[var(--surface-selected)]'
              }`}
            >
              <span className="flex flex-col min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`leading-tight text-[1rem] truncate ${focused ? 'text-[var(--text-on-selected)]' : 'text-text-primary'}`}>
                    {title}
                  </span>
                </span>
                <span className={`leading-normal text-[0.8461rem] truncate ${focused ? 'text-[var(--text-on-selected)] opacity-80' : 'text-text-secondary/80'}`}>
                  {blurb}
                </span>
              </span>
              {selected && (
                <CheckIcon className="absolute end-4 top-1/2 -translate-y-1/2 w-4 h-4 flex-shrink-0 text-text-secondary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Effort for the model above. Left and right arrows step it; the slider draws the
          step at once while the write waits for the key presses to stop. */}
      {effort.supportsEffort && (
        // border-subtle is 2 of 255 away from the panel's own colour and draws nothing; the
        // divider has to be visible to mark the effort off from the models above it.
        <div className="flex-shrink-0 mx-1 mb-1 border-t border-border-default pt-1">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <span className="flex-shrink-0 text-text-secondary">
              <EffortIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 text-[1rem] text-text-primary">
              {t('modelSwitch.effort')} <span className="text-text-tertiary">({effort.label})</span>
            </div>
            <EffortSlider index={effort.index} />
          </div>
        </div>
      )}
    </div>
  );
}
