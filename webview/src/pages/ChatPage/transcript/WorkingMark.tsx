import { useEffect, useRef } from 'react';
import { BLOCKED, BOARD, MAX_SHAPES, shapesAt, type MarkShape, type WorkingActivity } from './workingMarkMotion';

export type { WorkingActivity } from './workingMarkMotion';

const CLAY = '#d97757';
const SLOTS = Array.from({ length: MAX_SHAPES }, (_, index) => index);

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Puts a shape on an ellipse, or takes the ellipse out of sight when the moment has no shape for it. */
function place(element: SVGEllipseElement | null, shape: MarkShape | undefined): void {
  if (!element) return;
  if (!shape) {
    element.setAttribute('rx', '0');
    element.setAttribute('ry', '0');
    return;
  }
  element.setAttribute('cx', shape.x.toFixed(2));
  element.setAttribute('cy', shape.y.toFixed(2));
  element.setAttribute('rx', shape.rx.toFixed(2));
  element.setAttribute('ry', shape.ry.toFixed(2));
  element.setAttribute('transform', shape.rot === 0 ? '' : `rotate(${shape.rot} ${shape.x.toFixed(2)} ${shape.y.toFixed(2)})`);
}

/**
 * The small mark that says the model is working, drawn the way the desktop app's mark looks and moves: orange dots
 * that travel and breathe, one way for each thing the work is doing, and an amber ring while it waits on the person.
 *
 * It is drawn here, from the motion in workingMarkMotion.ts, so that it looks the same wherever this app runs.
 * The shapes are moved by one animation frame loop that changes the ellipses directly, not by React state: a
 * render sixty times a second for a few ellipses would cost more than the ellipses.
 */
export function WorkingMark({ activity = 'think', size = 20 }: { activity?: WorkingActivity; size?: number }) {
  const shapes = useRef<Array<SVGEllipseElement | null>>([]);

  useEffect(() => {
    if (activity === 'blocked') return;
    const draw = (ms: number) => {
      const now = shapesAt(activity, ms);
      SLOTS.forEach((slot) => place(shapes.current[slot], now[slot]));
    };
    draw(0);
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') return;
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      draw(now - started);
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [activity]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOARD} ${BOARD}`}
      className="flex-shrink-0"
      aria-hidden="true"
      data-testid="working-mark"
      data-activity={activity}
    >
      {activity === 'blocked' ? (
        <>
          <circle cx={BOARD / 2} cy={BOARD / 2} r={BLOCKED.disc} fill={BLOCKED.color} />
          <circle cx={BOARD / 2} cy={BOARD / 2} r={BLOCKED.ring} fill="none" stroke={BLOCKED.color} strokeWidth={BLOCKED.stroke} />
        </>
      ) : (
        SLOTS.map((slot) => (
          <ellipse
            key={slot}
            ref={(element) => {
              shapes.current[slot] = element;
            }}
            rx="0"
            ry="0"
            fill={CLAY}
          />
        ))
      )}
    </svg>
  );
}
