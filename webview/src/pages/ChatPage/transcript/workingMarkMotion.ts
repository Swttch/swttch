import { CODE_FRAMES, FRAME_MS, READ_FRAMES, THINK_FRAMES, type MarkFrame } from './workingMarkFrames';

/**
 * The motion of the working mark, as pure functions of time.
 *
 * The mark is drawn on a 48 x 48 board (the board the desktop app's own mark is drawn on is the same size, so the
 * two read the same at any size). Every function answers with the shapes to draw at a moment: where each one
 * stands, how wide and high it is, and how far it is turned. Nothing here draws.
 */

/** One dot, or two touching dots drawn as one longer shape: an ellipse on the board. */
export interface MarkShape {
  x: number;
  y: number;
  /** Half the width and half the height, before the turn. */
  rx: number;
  ry: number;
  /** The turn, in degrees. */
  rot: number;
}

/** The board the shapes stand on, and its middle. */
export const BOARD = 48;
const MID = BOARD / 2;

/** The most shapes any activity draws at once. */
export const MAX_SHAPES = 4;

/** What the mark says the work is doing. */
export type WorkingActivity = 'think' | 'code' | 'read' | 'default' | 'blocked';

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

const dot = (x: number, y: number, r: number): MarkShape => ({ x, y, rx: r, ry: r, rot: 0 });

/** The three dots of the wave [ms] into the motion. */
export function waveShapes(ms: number): MarkShape[] {
  const at = (((ms % WAVE_MS) + WAVE_MS) % WAVE_MS) / WAVE_MS;
  const offset = along(WAVE_SIDE_OFFSET, at);
  const side = along(WAVE_SIDE_R, at);
  return [dot(MID - offset, MID, side), dot(MID, MID, along(WAVE_MIDDLE_R, at)), dot(MID + offset, MID, side)];
}

const LOOPS: Record<'think' | 'code' | 'read', ReadonlyArray<MarkFrame>> = {
  think: THINK_FRAMES,
  code: CODE_FRAMES,
  read: READ_FRAMES,
};

/** The frame of a looping activity [ms] into the motion, and how long the whole loop takes. */
export function loopFrame(activity: 'think' | 'code' | 'read', ms: number): MarkFrame {
  const frames = LOOPS[activity];
  return frames[Math.floor(Math.max(0, ms) / FRAME_MS) % frames.length];
}

export function loopMs(activity: 'think' | 'code' | 'read'): number {
  return LOOPS[activity].length * FRAME_MS;
}

/** The shapes of a moving activity [ms] into the motion. A frame never holds more than [MAX_SHAPES]. */
export function shapesAt(activity: Exclude<WorkingActivity, 'blocked'>, ms: number): MarkShape[] {
  if (activity === 'default') return waveShapes(ms);
  return loopFrame(activity, ms).map(([x, y, rx, ry, rot]) => ({ x, y, rx, ry, rot }));
}

/** What is drawn while the work waits on the person: a filled disc inside a ring, in the warning amber, and still. */
export const BLOCKED = { disc: 10.5, ring: 16.6, stroke: 2.6, color: '#f0ac55' } as const;
