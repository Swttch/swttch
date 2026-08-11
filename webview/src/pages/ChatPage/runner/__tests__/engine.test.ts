import { describe, expect, it } from 'vitest';
import {
  GROUND_Y,
  RUNNER_X,
  WORLD_WIDTH,
  createState,
  jump,
  releaseJump,
  runnerHeight,
  runnerWidth,
  startRun,
  step,
  type RunnerState,
} from '../engine';
import { CORAL_SMALL, DORONGI } from '../sprites';

const FRAME = 1 / 60;

/** Runs the world forward without ever spawning a new obstacle. */
const advance = (state: RunnerState, seconds: number, random = () => 0.99) => {
  let next = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    next = step(next, { dt: FRAME, runnerGrid: DORONGI, random });
  }
  return next;
};

describe('runner engine', () => {
  it('stays put until the run is started', () => {
    const state = createState();
    expect(state.phase).toBe('ready');

    const after = step(state, { dt: FRAME, runnerGrid: DORONGI });
    expect(after).toBe(state);
  });

  it('accelerates as the run goes on', () => {
    const start = startRun();
    const later = advance(start, 5);

    expect(later.speed).toBeGreaterThan(start.speed);
    expect(later.distance).toBeGreaterThan(0);
  });

  it('caps the speed so the run stays playable', () => {
    const veryLate = advance(startRun(), 400);
    expect(veryLate.speed).toBeLessThanOrEqual(640);
  });

  it('lifts the runner on a jump and returns it to the ground', () => {
    const running = startRun();
    const jumping = jump(running);
    expect(jumping.velocity).toBeGreaterThan(0);

    const midAir = advance(jumping, 0.2);
    expect(midAir.y).toBeGreaterThan(0);

    const landed = advance(jumping, 2);
    expect(landed.y).toBe(0);
    expect(landed.velocity).toBe(0);
  });

  it('ignores a jump while already airborne, so the runner cannot climb', () => {
    const airborne = advance(jump(startRun()), 0.1);
    expect(airborne.y).toBeGreaterThan(0);

    expect(jump(airborne)).toBe(airborne);
  });

  it('does not jump before the run has started', () => {
    const ready = createState();
    expect(jump(ready)).toBe(ready);
  });

  it('trims the ascent when the key is released early', () => {
    const jumping = jump(startRun());
    const released = releaseJump(jumping);

    expect(released.velocity).toBeLessThan(jumping.velocity);
    expect(advance(released, 2).y).toBe(0);
  });

  it('leaves a slow ascent alone when released', () => {
    const barelyRising: RunnerState = { ...startRun(), velocity: 100 };
    expect(releaseJump(barelyRising)).toBe(barelyRising);
  });

  it('ends the run when the runner meets an obstacle', () => {
    const state: RunnerState = {
      ...startRun(),
      obstacles: [{ x: RUNNER_X, y: 0, grid: CORAL_SMALL, kind: 'ground' }],
    };

    const after = step(state, { dt: FRAME, runnerGrid: DORONGI });
    expect(after.phase).toBe('over');
  });

  it('lets a well-timed jump clear an obstacle', () => {
    let state: RunnerState = {
      ...startRun(),
      obstacles: [{ x: RUNNER_X + 90, y: 0, grid: CORAL_SMALL, kind: 'ground' }],
      // Keep the lane clear so only the obstacle under test matters.
      nextSpawn: Number.MAX_SAFE_INTEGER,
    };
    // Jump as the obstacle comes into range, not the moment it appears: the
    // arc peaks partway through, so leaping too early lands on top of it.
    state = jump(state);
    state = advance(state, 1.2);

    expect(state.phase).toBe('running');
    expect(state.obstacles).toEqual([]);
  });

  it('lands on an obstacle when the jump is mistimed', () => {
    let state: RunnerState = {
      ...startRun(),
      obstacles: [{ x: RUNNER_X + 320, y: 0, grid: CORAL_SMALL, kind: 'ground' }],
      nextSpawn: Number.MAX_SAFE_INTEGER,
    };
    // Far too early — the runner is descending again by the time it arrives.
    state = jump(state);
    state = advance(state, 1.5);

    expect(state.phase).toBe('over');
  });

  it('scores by distance, and keeps the score on the frame that ends the run', () => {
    const finished: RunnerState = {
      ...startRun(),
      distance: 4000,
      obstacles: [{ x: RUNNER_X, y: 0, grid: CORAL_SMALL, kind: 'ground' }],
    };

    const after = step(finished, { dt: FRAME, runnerGrid: DORONGI });
    expect(after.phase).toBe('over');
    expect(after.score).toBeGreaterThan(0);
  });

  it('starts each run from scratch, since the record lives outside the world', () => {
    const restarted = startRun();

    expect(restarted.score).toBe(0);
    expect(restarted.distance).toBe(0);
    expect(restarted.obstacles).toEqual([]);
    expect(restarted.phase).toBe('running');
  });

  it('spawns obstacles at the right edge and retires them past the left', () => {
    let state: RunnerState = { ...startRun(), nextSpawn: 0 };
    state = step(state, { dt: FRAME, runnerGrid: DORONGI, random: () => 0.5 });

    expect(state.obstacles).toHaveLength(1);
    expect(state.obstacles[0].x).toBe(WORLD_WIDTH);

    // Once past the left edge the obstacle is dropped rather than accumulating.
    const offscreen: RunnerState = {
      ...startRun(),
      obstacles: [{ x: -runnerWidth(CORAL_SMALL) - 1, y: 0, grid: CORAL_SMALL, kind: 'ground' }],
      nextSpawn: Number.MAX_SAFE_INTEGER,
    };
    expect(step(offscreen, { dt: FRAME, runnerGrid: DORONGI }).obstacles).toEqual([]);
  });

  it('keeps the runner standing on the ground line', () => {
    const grounded = advance(startRun(), 1);
    const top = GROUND_Y - runnerHeight(DORONGI) - grounded.y;

    expect(top + runnerHeight(DORONGI)).toBe(GROUND_Y);
  });

  it('is frozen once the run is over', () => {
    const over: RunnerState = { ...createState(), phase: 'over' };
    expect(step(over, { dt: FRAME, runnerGrid: DORONGI })).toBe(over);
  });
});
