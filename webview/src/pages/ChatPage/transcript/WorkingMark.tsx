import { useEffect, useRef } from 'react';
import { BLOCKED, BOARD, orbitDots, waveDots, type MarkDot } from './workingMarkMotion';

/** What the mark says the work is doing: thinking, going on as usual, or waiting on the person. */
export type WorkingActivity = 'think' | 'default' | 'blocked';

const CLAY = '#d97757';

/** The dots a moving activity draws, given the time since the mark appeared. */
const MOTION: Record<'think' | 'default', (ms: number) => MarkDot[]> = {
  think: orbitDots,
  default: waveDots,
};

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The small mark that says the model is working, drawn the way the desktop app's mark looks and moves: a few
 * orange dots that travel and breathe, and an amber ring while the work waits on the person.
 *
 * It is drawn here, from the motion in workingMarkMotion.ts, so that it looks the same wherever this app runs.
 * The dots are moved by one animation frame loop that changes the circles directly, not by React state: a render
 * sixty times a second for three circles would cost more than the circles.
 */
export function WorkingMark({ activity = 'think', size = 20 }: { activity?: WorkingActivity; size?: number }) {
  const dots = useRef<Array<SVGCircleElement | null>>([null, null, null]);

  useEffect(() => {
    if (activity === 'blocked') return;
    const motion = MOTION[activity];
    const place = (ms: number) => {
      motion(ms).forEach((dot, index) => {
        const circle = dots.current[index];
        if (!circle) return;
        circle.setAttribute('cx', dot.x.toFixed(2));
        circle.setAttribute('cy', dot.y.toFixed(2));
        circle.setAttribute('r', dot.r.toFixed(2));
      });
    };
    place(0);
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') return;
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      place(now - started);
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
        [0, 1, 2].map((index) => (
          <circle
            key={index}
            ref={(element) => {
              dots.current[index] = element;
            }}
            fill={CLAY}
          />
        ))
      )}
    </svg>
  );
}
