/**
 * The motion of the working mark, as pure functions of time.
 *
 * The mark is drawn on a 48 x 48 board (the board the desktop app's own mark is drawn on is the same size, so the
 * two read the same at any size). Every function answers with the dots to draw at a moment: where each one stands
 * and how big it is. Nothing here draws.
 */

export interface MarkDot {
  x: number;
  y: number;
  r: number;
}

/** The board the dots stand on, and its middle. */
export const BOARD = 48;
const MID = BOARD / 2;

/** Eases a step from 0 to 1 the way a slow-in, slow-out move does. */
function smooth(p: number): number {
  return p * p * (3 - 2 * p);
}

/** A value read along a list of [time, value] stops, eased between one stop and the next. */
function along(stops: ReadonlyArray<readonly [number, number]>, at: number): number {
  for (let i = 1; i < stops.length; i++) {
    const [t1, v1] = stops[i];
    if (at <= t1) {
      const [t0, v0] = stops[i - 1];
      return v0 + (v1 - v0) * smooth(t1 === t0 ? 1 : (at - t0) / (t1 - t0));
    }
  }
  return stops[stops.length - 1][1];
}

/** The time one turn of the three-dot wave takes. */
export const WAVE_MS = 1333;

// Three dots in a row. The two outer ones draw in towards the middle and shrink while the middle one swells, then
// they part again: the row breathes. The stops are fractions of one turn.
const WAVE_SIDE_OFFSET = [[0, 16.4], [0.13, 15.5], [0.3, 11.5], [0.45, 11.1], [0.6, 11.5], [0.73, 12.9], [0.88, 16], [1, 16.4]] as const;
const WAVE_SIDE_R = [[0, 4.15], [0.13, 3.97], [0.3, 3.05], [0.45, 2.83], [0.6, 2.86], [0.73, 3.3], [0.88, 4.1], [1, 4.15]] as const;
const WAVE_MIDDLE_R = [[0, 2.88], [0.13, 2.96], [0.3, 3.75], [0.45, 4.03], [0.6, 4.0], [0.73, 3.5], [0.88, 2.95], [1, 2.88]] as const;

/** The three dots of the wave [ms] into the motion. */
export function waveDots(ms: number): MarkDot[] {
  const at = (((ms % WAVE_MS) + WAVE_MS) % WAVE_MS) / WAVE_MS;
  const offset = along(WAVE_SIDE_OFFSET, at);
  const side = along(WAVE_SIDE_R, at);
  return [
    { x: MID - offset, y: MID, r: side },
    { x: MID, y: MID, r: along(WAVE_MIDDLE_R, at) },
    { x: MID + offset, y: MID, r: side },
  ];
}

/** The time one lap of the thinking orbit takes, and the time its ring takes to open and close once. */
export const ORBIT_LAP_MS = 1200;
export const ORBIT_OPEN_MS = 920;

const ORBIT_HALF_WIDTH = 17.2;
const ORBIT_HALF_HEIGHT = 9.5;

/**
 * The three dots of the thinking orbit [ms] into the motion: they travel round a ring that is seen from the side,
 * so it is flat while the ring is edge-on and opens into an ellipse as it tips towards the viewer and closes
 * again. The dots on the far side are smaller than the ones on the near side, which is what makes the ring read as
 * a ring and not as a line of dots sliding to and fro.
 */
export function orbitDots(ms: number): MarkDot[] {
  const lap = (ms / ORBIT_LAP_MS) * Math.PI * 2;
  const open = Math.max(0, Math.sin((ms / ORBIT_OPEN_MS) * Math.PI));
  return [0, 1, 2].map((k) => {
    const angle = lap + (k * Math.PI * 2) / 3;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const r = 2.9 + 1.3 * Math.abs(cos) ** 1.5 - 0.5 * open * sin;
    return {
      x: MID + ORBIT_HALF_WIDTH * cos,
      y: MID - ORBIT_HALF_HEIGHT * open * sin,
      r: Math.min(4.9, Math.max(2.6, r)),
    };
  });
}

/** What is drawn while the work waits on the person: a filled disc inside a ring, in the warning amber, and still. */
export const BLOCKED = { disc: 10.5, ring: 16.6, stroke: 2.6, color: '#f0ac55' } as const;
