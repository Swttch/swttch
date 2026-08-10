import { CACTUS_LARGE, CACTUS_SMALL, gridHeight, gridWidth, type PixelGrid } from './sprites';

/**
 * The runner game's rules, kept free of React and the DOM so it can be stepped
 * by a test with plain numbers. Rendering reads this state but never writes it.
 */

export type RunnerPhase = 'ready' | 'running' | 'over';

export interface Obstacle {
  /** Left edge, in world units. */
  x: number;
  grid: PixelGrid;
}

export interface RunnerState {
  phase: RunnerPhase;
  /** Runner's height above the ground, in world units. */
  y: number;
  velocity: number;
  speed: number;
  distance: number;
  score: number;
  best: number;
  obstacles: Obstacle[];
  /** Distance until the next obstacle spawns. */
  nextSpawn: number;
  /** Advances with distance; drives the two-frame running animation. */
  legPhase: number;
}

/**
 * World units are independent of canvas pixels, so the same game plays
 * identically at any rendered size.
 */
export const WORLD_WIDTH = 600;
export const WORLD_HEIGHT = 150;
/** Baseline the runner and obstacles stand on. */
export const GROUND_Y = 128;
export const RUNNER_X = 40;
/** Edge of one runner/obstacle sprite cell, in world units. */
export const PIXEL = 3;

const GRAVITY = 2400;
const JUMP_VELOCITY = 660;
/** Cuts an ascent short when the key is released, for variable jump height. */
const SHORT_HOP_VELOCITY = 260;

const START_SPEED = 260;
const MAX_SPEED = 640;
const ACCELERATION = 6;

const MIN_SPAWN_GAP = 180;
const SPAWN_GAP_RANGE = 260;
/** Points per world unit travelled. */
const SCORE_RATE = 0.025;

/** Obstacles are inset slightly so a near miss does not read as a hit. */
const HIT_INSET = 3;

export const runnerWidth = (grid: PixelGrid) => gridWidth(grid) * PIXEL;
export const runnerHeight = (grid: PixelGrid) => gridHeight(grid) * PIXEL;

export const createState = (best = 0): RunnerState => ({
  phase: 'ready',
  y: 0,
  velocity: 0,
  speed: START_SPEED,
  distance: 0,
  score: 0,
  best,
  obstacles: [],
  nextSpawn: MIN_SPAWN_GAP,
  legPhase: 0,
});

export const startRun = (state: RunnerState): RunnerState => ({
  ...createState(state.best),
  phase: 'running',
});

/** Jumps if grounded; ignored in mid-air so the runner cannot climb. */
export const jump = (state: RunnerState): RunnerState => {
  if (state.phase !== 'running' || state.y > 0) return state;
  return { ...state, velocity: JUMP_VELOCITY };
};

/** Releasing early trims the remaining ascent. */
export const releaseJump = (state: RunnerState): RunnerState => {
  if (state.velocity <= SHORT_HOP_VELOCITY) return state;
  return { ...state, velocity: SHORT_HOP_VELOCITY };
};

/**
 * Deterministic spawn sizing: `random` is injected so tests can pin it down.
 */
const spawnObstacle = (random: () => number): Obstacle => ({
  x: WORLD_WIDTH,
  grid: random() < 0.5 ? CACTUS_SMALL : CACTUS_LARGE,
});

const overlaps = (
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

export interface StepOptions {
  /** Seconds since the previous step. */
  dt: number;
  /** The runner's current sprite, whose box is used for collision. */
  runnerGrid: PixelGrid;
  random?: () => number;
}

/**
 * Advances the world by `dt` seconds and returns the next state. Pure: given
 * the same inputs it always produces the same output.
 */
export const step = (state: RunnerState, { dt, runnerGrid, random = Math.random }: StepOptions): RunnerState => {
  if (state.phase !== 'running') return state;

  const speed = Math.min(MAX_SPEED, state.speed + ACCELERATION * dt);
  const travelled = speed * dt;
  const distance = state.distance + travelled;

  let y = state.y + state.velocity * dt;
  let velocity = state.velocity - GRAVITY * dt;
  if (y <= 0) {
    y = 0;
    velocity = 0;
  }

  const obstacles: Obstacle[] = [];
  for (const obstacle of state.obstacles) {
    const x = obstacle.x - travelled;
    // Keep obstacles until they are fully past the left edge.
    if (x + runnerWidth(obstacle.grid) > 0) obstacles.push({ ...obstacle, x });
  }

  let nextSpawn = state.nextSpawn - travelled;
  if (nextSpawn <= 0) {
    obstacles.push(spawnObstacle(random));
    // Faster speeds need a longer gap to stay clearable.
    nextSpawn = MIN_SPAWN_GAP + random() * SPAWN_GAP_RANGE + speed * 0.15;
  }

  const runnerW = runnerWidth(runnerGrid);
  const runnerH = runnerHeight(runnerGrid);
  const runnerTop = GROUND_Y - runnerH - y;

  for (const obstacle of obstacles) {
    const obstacleW = runnerWidth(obstacle.grid);
    const obstacleH = runnerHeight(obstacle.grid);
    if (
      overlaps(
        RUNNER_X + HIT_INSET, runnerTop + HIT_INSET, runnerW - HIT_INSET * 2, runnerH - HIT_INSET * 2,
        obstacle.x + HIT_INSET, GROUND_Y - obstacleH, obstacleW - HIT_INSET * 2, obstacleH,
      )
    ) {
      const score = Math.floor(distance * SCORE_RATE);
      return {
        ...state,
        phase: 'over',
        y,
        velocity,
        speed,
        distance,
        obstacles,
        score,
        best: Math.max(state.best, score),
      };
    }
  }

  return {
    ...state,
    y,
    velocity,
    speed,
    distance,
    obstacles,
    nextSpawn,
    score: Math.floor(distance * SCORE_RATE),
    legPhase: state.legPhase + travelled,
  };
};
