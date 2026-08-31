import { useRef, type PointerEvent } from 'react';
import { useEffort } from '@/hooks/useEffort';
import { buildEffortLevels } from '@/types/effort';
import { useTranslation } from '@/i18n';
import { indexFromOffset } from './geometry';

interface Props {
  className?: string;
}

// The thumb's travel, expressed for CSS calc(). This is `stepSpan()` from
// ./geometry written in CSS: the layout below and the click math in geometry.ts
// MUST describe the same track, or a notch ends up somewhere a click on it does
// not select — which is exactly how ultracode became unreachable (#377).
const SPAN = '(100% - var(--thumb-size) - 2 * var(--thumb-inset))';

/**
 * Effort level slider, ported from the Claude Code (Cursor) extension's
 * effort toggle (its `g$` component). A horizontal track with one notch per
 * level and a draggable thumb; clicking or dragging picks a level by position.
 *
 * When ultracode is available, a synthetic top step is appended (rendered
 * purple): landing on it engages ultracode (xhigh effort + workflows) instead
 * of setting a plain effort level. The level steps are the model's
 * `supportedEffortLevels`; `auto` is only the unset-state label, never a step.
 *
 * Returns null when the current model doesn't support effort, so callers can
 * drop it in unconditionally.
 */
export function EffortSlider(props: Props) {
  const { className } = props;
  const { t } = useTranslation('common');
  const {
    supportsEffort,
    levels: supported,
    current,
    setLevel,
    ultracodeAvailable,
    ultracodeEnabled,
    enableUltracode,
  } = useEffort();
  // Tracks the step index the active drag last applied, so pointermove only
  // writes settings when the index actually changes.
  const dragIndexRef = useRef<number | undefined>(undefined);

  if (!supportsEffort) return null;

  const levels = buildEffortLevels(supported);
  // Total steps = real levels + (ultracode ? 1 trailing step : 0).
  const count = levels.length + (ultracodeAvailable ? 1 : 0);
  const ultracodeIndex = ultracodeAvailable ? count - 1 : -1;
  const currentIndex = ultracodeEnabled
    ? ultracodeIndex
    : Math.max(0, levels.findIndex((l) => l.key === current));
  const ratio = count > 1 ? currentIndex / (count - 1) : 0;

  const thumbLeft = `calc(var(--thumb-inset) + ${ratio} * ${SPAN})`;
  const fillWidth = `calc(var(--thumb-inset) + ${ratio} * ${SPAN} + var(--thumb-size) + var(--thumb-inset))`;
  const notchLeft = (r: number) =>
    `calc(var(--thumb-inset) + ${r} * ${SPAN} + var(--thumb-size) / 2)`;

  // Read the track box from the element rather than restating the CSS values
  // here, so the click math cannot drift from what index.css actually renders.
  const indexFromEvent = (e: PointerEvent<HTMLButtonElement>) => {
    if (count <= 1) return 0;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
    return indexFromOffset(
      e.clientX - rect.left,
      count,
      rect.width,
      px('--thumb-size'),
      px('--thumb-inset'),
    );
  };

  const applyIndex = (i: number) => {
    if (i === ultracodeIndex) {
      enableUltracode();
      return;
    }
    const level = levels[i];
    if (level) setLevel(level.key);
  };

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const i = indexFromEvent(e);
    dragIndexRef.current = i;
    applyIndex(i);
  };

  const handlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (dragIndexRef.current === undefined) return;
    const i = indexFromEvent(e);
    if (i === dragIndexRef.current) return;
    dragIndexRef.current = i;
    applyIndex(i);
  };

  const endDrag = () => {
    dragIndexRef.current = undefined;
  };

  const rootClass = [
    'effort-slider',
    ultracodeEnabled && 'effort-slider--ultracode',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={rootClass}
      title={ultracodeAvailable ? t('effortSlider.tooltipUltracode') : t('effortSlider.tooltip')}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      // Stop the click from bubbling to a parent row handler (the slash-command
      // row's onClick cycles effort) — the slider already applied the step.
      onClick={(e) => e.stopPropagation()}
    >
      <span className="effort-slider__fill" style={{ width: fillWidth }} />
      {Array.from({ length: count }, (_, i) => {
        const r = count > 1 ? i / (count - 1) : 0;
        const isUltracodeNotch = i === ultracodeIndex;
        return (
          <span
            key={i}
            className={isUltracodeNotch ? 'effort-slider__notch effort-slider__notch--ultracode' : 'effort-slider__notch'}
            style={{ left: notchLeft(r) }}
          />
        );
      })}
      <span className="effort-slider__thumb" style={{ left: thumbLeft }} />
    </button>
  );
}
