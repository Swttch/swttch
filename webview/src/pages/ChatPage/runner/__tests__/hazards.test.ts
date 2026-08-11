import { describe, expect, it } from 'vitest';
import {
  INK_SCORE,
  RUNNER_X,
  SEAHORSE_SCORE,
  SLOPE_SPEED_FACTOR,
  createState,
  jump,
  obstacleHeight,
  setDucking,
  startRun,
  step,
  type Obstacle,
  type RunnerState,
} from '../engine';
import { CORAL_SMALL, RUNNER_DUCKING, RUNNER_STANDING, SEAHORSE } from '../sprites';

const FRAME = 1 / 60;

const running = (overrides: Partial<RunnerState> = {}): RunnerState => ({
  ...startRun(createState()),
  nextSpawn: Number.MAX_SAFE_INTEGER,
  ...overrides,
});

const seahorseAt = (x: number, y: number): Obstacle => ({ x, y, grid: SEAHORSE, kind: 'seahorse' });

describe('ducking', () => {
  it('slips under a seahorse that a standing runner would hit', () => {
    // Riding above a ducking runner's head but below a standing one's.
    const world = { obstacles: [seahorseAt(RUNNER_X, obstacleHeight(RUNNER_DUCKING) + 4)] };

    const standing = step(running(world), { dt: FRAME, runnerGrid: RUNNER_STANDING });
    expect(standing.phase).toBe('over');

    const ducked = step(setDucking(running(world), true), { dt: FRAME, runnerGrid: RUNNER_DUCKING });
    expect(ducked.phase).toBe('running');
  });

  it('does not help against something sitting on the seabed', () => {
    const world = { obstacles: [{ x: RUNNER_X, y: 0, grid: CORAL_SMALL, kind: 'ground' as const }] };
    const ducked = step(setDucking(running(world), true), { dt: FRAME, runnerGrid: RUNNER_DUCKING });

    expect(ducked.phase).toBe('over');
  });

  it('is cancelled by jumping, so the two inputs cannot fight', () => {
    const ducking = setDucking(running(), true);
    expect(ducking.ducking).toBe(true);

    expect(jump(ducking).ducking).toBe(false);
  });

  it('pulls the runner down faster while airborne', () => {
    const airborne = jump(running());
    const advance = (state: RunnerState, grid: typeof RUNNER_STANDING) => {
      let next = state;
      for (let i = 0; i < 12; i++) next = step(next, { dt: FRAME, runnerGrid: grid });
      return next;
    };

    const floating = advance(airborne, RUNNER_STANDING);
    const dropping = advance(setDucking(airborne, true), RUNNER_DUCKING);

    expect(dropping.y).toBeLessThan(floating.y);
  });

  it('is ignored before the run starts', () => {
    const ready = createState();
    expect(setDucking(ready, true)).toBe(ready);
  });
});

describe('seahorses', () => {
  it('stay away until the player has settled in', () => {
    const early = running({ nextSpawn: 0, distance: 0 });
    // A random source that would always pick a seahorse if allowed to.
    const spawned = step(early, { dt: FRAME, runnerGrid: RUNNER_STANDING, random: () => 0.01 });

    expect(spawned.obstacles.every((obstacle) => obstacle.kind === 'ground')).toBe(true);
  });

  it('appear once the score passes the threshold', () => {
    // Distance chosen to sit above SEAHORSE_SCORE once converted to points.
    const late = running({ nextSpawn: 0, distance: (SEAHORSE_SCORE + 50) / 0.025 });
    const spawned = step(late, { dt: FRAME, runnerGrid: RUNNER_STANDING, random: () => 0.01 });

    expect(spawned.obstacles.some((obstacle) => obstacle.kind === 'seahorse')).toBe(true);
  });
});

describe('ink', () => {
  it('is not spat before the run gets long', () => {
    const early = running({
      distance: (INK_SCORE - 100) / 0.025,
      obstacles: [seahorseAt(RUNNER_X + 100, 20)],
    });
    const after = step(early, { dt: FRAME, runnerGrid: RUNNER_STANDING, random: () => 0 });

    expect(after.obstacles.some((obstacle) => obstacle.kind === 'ink')).toBe(false);
  });

  it('is spat once a seahorse gets close late in a run', () => {
    const late = running({
      distance: (INK_SCORE + 100) / 0.025,
      obstacles: [seahorseAt(RUNNER_X + 100, 20)],
    });
    // random() === 0 always clears the chance roll.
    const after = step(late, { dt: FRAME, runnerGrid: RUNNER_STANDING, random: () => 0 });

    const ink = after.obstacles.find((obstacle) => obstacle.kind === 'ink');
    expect(ink).toBeDefined();
    expect(ink?.vx).toBeGreaterThan(0);
  });

  it('is only spat once per seahorse', () => {
    let state = running({
      distance: (INK_SCORE + 100) / 0.025,
      obstacles: [seahorseAt(RUNNER_X + 120, 20)],
    });
    for (let i = 0; i < 20; i++) {
      state = step(state, { dt: FRAME, runnerGrid: RUNNER_STANDING, random: () => 0 });
      if (state.phase !== 'running') break;
    }

    expect(state.obstacles.filter((obstacle) => obstacle.kind === 'ink').length).toBeLessThanOrEqual(1);
  });

  it('travels toward the runner faster than the world scrolls', () => {
    const withInk = running({
      distance: (INK_SCORE + 100) / 0.025,
      obstacles: [
        { x: 300, y: 20, grid: CORAL_SMALL, kind: 'ground' },
        { x: 300, y: 20, grid: CORAL_SMALL, kind: 'ink', vx: 150 },
      ],
    });
    const after = step(withInk, { dt: FRAME, runnerGrid: RUNNER_STANDING, random: () => 1 });

    const ground = after.obstacles.find((obstacle) => obstacle.kind === 'ground');
    const ink = after.obstacles.find((obstacle) => obstacle.kind === 'ink');
    expect(ink!.x).toBeLessThan(ground!.x);
  });

  it('kills on contact', () => {
    const hit = running({
      obstacles: [{ x: RUNNER_X, y: 10, grid: CORAL_SMALL, kind: 'ink', vx: 150 }],
    });
    expect(step(hit, { dt: FRAME, runnerGrid: RUNNER_STANDING }).phase).toBe('over');
  });
});

describe('seabed relief', () => {
  it('slows the runner on a climb and speeds it up on a descent', () => {
    const base = running({ slope: 0, slopeRemaining: Number.MAX_SAFE_INTEGER });
    const uphill = running({ slope: 0.12, slopeRemaining: Number.MAX_SAFE_INTEGER });
    const downhill = running({ slope: -0.12, slopeRemaining: Number.MAX_SAFE_INTEGER });

    const travel = (state: RunnerState) => {
      const after = step(state, { dt: FRAME, runnerGrid: RUNNER_STANDING });
      return after.distance;
    };

    expect(travel(uphill)).toBeLessThan(travel(base));
    expect(travel(downhill)).toBeGreaterThan(travel(base));
    expect(SLOPE_SPEED_FACTOR).toBeLessThan(1);
  });

  it('raises and lowers the seabed as the runner travels', () => {
    let climbing = running({ slope: 0.12, slopeRemaining: Number.MAX_SAFE_INTEGER });
    for (let i = 0; i < 30; i++) climbing = step(climbing, { dt: FRAME, runnerGrid: RUNNER_STANDING });

    expect(climbing.groundHeight).toBeGreaterThan(0);
  });

  it('keeps the seabed within bounds', () => {
    let state = running({ slope: 0.12, slopeRemaining: Number.MAX_SAFE_INTEGER });
    for (let i = 0; i < 2000; i++) state = step(state, { dt: FRAME, runnerGrid: RUNNER_STANDING });
    expect(state.groundHeight).toBeLessThanOrEqual(26);

    let sinking = running({ slope: -0.12, slopeRemaining: Number.MAX_SAFE_INTEGER });
    for (let i = 0; i < 2000; i++) sinking = step(sinking, { dt: FRAME, runnerGrid: RUNNER_STANDING });
    expect(sinking.groundHeight).toBeGreaterThanOrEqual(0);
  });
});
