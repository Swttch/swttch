import { CORAL_LARGE, CORAL_SMALL, INK, SEAHORSE, SHELL, gridHeight, gridWidth, type PixelGrid } from './sprites';

/**
 * The runner game's rules, kept free of React and the DOM so it can be stepped
 * by a test with plain numbers. Rendering reads this state but never writes it.
 *
 * Dorongi runs a reef: coral and shells sit on the seabed, and seahorses hang
 * in the water at various heights. Everything here is measured in world units,
 * independent of canvas pixels.
 */

export type RunnerPhase = 'ready' | 'running' | 'over';

export type ObstacleKind = 'ground' | 'seahorse' | 'ink';

export interface Obstacle {
  /** Left edge, in world units. */
  x: number;
  /** Height above the seabed. Ground obstacles sit at 0. */
  y: number;
  grid: PixelGrid;
  kind: ObstacleKind;
  /** Horizontal speed of its own, added to the world's scroll. Ink only. */
  vx?: number;
  /** A seahorse spits once; this marks that it already has. */
  hasSpat?: boolean;
}

export interface RunnerState {
  phase: RunnerPhase;
  /** Runner's height above the seabed, in world units. */
  y: number;
  velocity: number;
  ducking: boolean;
  /** How fast the world scrolls past, in world units per second. */
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

export const WORLD_WIDTH = 600;
export const WORLD_HEIGHT = 150;
/** The seabed the runner and the coral stand on. */
export const GROUND_Y = 128;
export const RUNNER_X = 40;
/** Edge of one sprite cell, in world units. */
export const PIXEL = 3;

const GRAVITY = 2400;
const JUMP_VELOCITY = 660;
/** Cuts an ascent short when the key is released, for variable jump height. */
const SHORT_HOP_VELOCITY = 260;
/** Ducking pulls the runner down faster, so it can drop under things. */
const DUCK_GRAVITY_BONUS = 2600;

const START_SPEED = 260;
const MAX_SPEED = 640;
const ACCELERATION = 6;

/** Points per world unit travelled. */
const SCORE_RATE = 0.025;

/** Obstacles are inset slightly so a near miss does not read as a hit. */
const HIT_INSET = 3;

/* Difficulty. The gap between obstacles shrinks as the run goes on, and new
 * hazards unlock at score thresholds so the opening is approachable. */
const START_MIN_GAP = 260;
const START_GAP_RANGE = 300;
/** The gap cannot close past this, or the game stops being clearable. */
const HARDEST_MIN_GAP = 150;
const HARDEST_GAP_RANGE = 150;
/** Score at which the spacing has tightened all the way. */
const FULL_DIFFICULTY_SCORE = 700;

export const SEAHORSE_SCORE = 120;
export const INK_SCORE = 350;

/**
 * Heights a seahorse can ride at, chosen against the runner's two hitboxes
 * (36 tall standing, 18 ducking): the low one sits in the way of both and has
 * to be jumped, while the upper two clear a ducking runner but not a standing
 * one. Riding any higher would sail over the runner entirely and stop being an
 * obstacle at all.
 */
const SEAHORSE_HEIGHTS = [6, 20, 30];

const INK_SPEED = 150;
/** A seahorse only spits once the runner is within this distance. */
const INK_TRIGGER_RANGE = 260;
const INK_CHANCE = 0.5;

export const obstacleWidth = (grid: PixelGrid) => gridWidth(grid) * PIXEL;
export const obstacleHeight = (grid: PixelGrid) => gridHeight(grid) * PIXEL;

/** Kept as aliases so existing call sites read naturally for the runner too. */
export const runnerWidth = obstacleWidth;
export const runnerHeight = obstacleHeight;

export const createState = (best = 0): RunnerState => ({
  phase: 'ready',
  y: 0,
  velocity: 0,
  ducking: false,
  speed: START_SPEED,
  distance: 0,
  score: 0,
  best,
  obstacles: [],
  nextSpawn: START_MIN_GAP,
  legPhase: 0,
});

export const startRun = (state: RunnerState): RunnerState => ({
  ...createState(state.best),
  phase: 'running',
});

/** Jumps if grounded; ignored in mid-air so the runner cannot climb. */
export const jump = (state: RunnerState): RunnerState => {
  if (state.phase !== 'running' || state.y > 0) return state;
  return { ...state, velocity: JUMP_VELOCITY, ducking: false };
};

/** Releasing early trims the remaining ascent. */
export const releaseJump = (state: RunnerState): RunnerState => {
  if (state.velocity <= SHORT_HOP_VELOCITY) return state;
  return { ...state, velocity: SHORT_HOP_VELOCITY };
};

export const setDucking = (state: RunnerState, ducking: boolean): RunnerState => {
  if (state.phase !== 'running' || state.ducking === ducking) return state;
  return { ...state, ducking };
};

/**
 * How tightly obstacles are spaced right now: 0 at the start of a run, 1 once
 * the difficulty has ramped all the way up.
 */
export const difficultyRatio = (score: number) => Math.min(1, score / FULL_DIFFICULTY_SCORE);

const spawnGap = (score: number, speed: number, random: () => number) => {
  const ratio = difficultyRatio(score);
  const min = START_MIN_GAP + (HARDEST_MIN_GAP - START_MIN_GAP) * ratio;
  const range = START_GAP_RANGE + (HARDEST_GAP_RANGE - START_GAP_RANGE) * ratio;
  // Faster speeds need a longer gap to stay clearable.
  return min + random() * range + speed * 0.12;
};

const spawnObstacle = (score: number, random: () => number): Obstacle => {
  // Seahorses only appear once the player has settled in, and never make up
  // the whole field, so there is always ground to read.
  if (score >= SEAHORSE_SCORE && random() < 0.35) {
    const height = SEAHORSE_HEIGHTS[Math.floor(random() * SEAHORSE_HEIGHTS.length)];
    return { x: WORLD_WIDTH, y: height, grid: SEAHORSE, kind: 'seahorse' };
  }
  const roll = random();
  const grid = roll < 0.3 ? SHELL : roll < 0.7 ? CORAL_SMALL : CORAL_LARGE;
  return { x: WORLD_WIDTH, y: 0, grid, kind: 'ground' };
};

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
  const score = Math.floor(distance * SCORE_RATE);

  const gravity = GRAVITY + (state.ducking && state.y > 0 ? DUCK_GRAVITY_BONUS : 0);
  let y = state.y + state.velocity * dt;
  let velocity = state.velocity - gravity * dt;
  if (y <= 0) {
    y = 0;
    velocity = 0;
  }

  const obstacles: Obstacle[] = [];
  for (const obstacle of state.obstacles) {
    const drift = obstacle.vx ? obstacle.vx * dt : 0;
    const x = obstacle.x - travelled - drift;
    // Keep obstacles until they are fully past the left edge.
    if (x + obstacleWidth(obstacle.grid) > 0) obstacles.push({ ...obstacle, x });
  }

  // Seahorses spit ink once the runner is close, but only late in a run.
  if (score >= INK_SCORE) {
    for (let i = 0; i < obstacles.length; i++) {
      const obstacle = obstacles[i];
      if (obstacle.kind !== 'seahorse' || obstacle.hasSpat) continue;
      const gap = obstacle.x - RUNNER_X;
      if (gap > 0 && gap < INK_TRIGGER_RANGE && random() < INK_CHANCE * dt * 60) {
        obstacles[i] = { ...obstacle, hasSpat: true };
        obstacles.push({
          x: obstacle.x,
          y: obstacle.y + obstacleHeight(obstacle.grid) / 2,
          grid: INK,
          kind: 'ink',
          vx: INK_SPEED,
        });
      }
    }
  }

  let nextSpawn = state.nextSpawn - travelled;
  if (nextSpawn <= 0) {
    obstacles.push(spawnObstacle(score, random));
    nextSpawn = spawnGap(score, speed, random);
  }

  const runnerW = obstacleWidth(runnerGrid);
  const runnerH = obstacleHeight(runnerGrid);
  const runnerTop = GROUND_Y - runnerH - y;

  for (const obstacle of obstacles) {
    const width = obstacleWidth(obstacle.grid);
    const height = obstacleHeight(obstacle.grid);
    // Ground obstacles sit on the seabed; everything else holds its own height.
    const bottom = GROUND_Y - obstacle.y;
    if (
      overlaps(
        RUNNER_X + HIT_INSET, runnerTop + HIT_INSET, runnerW - HIT_INSET * 2, runnerH - HIT_INSET * 2,
        obstacle.x + HIT_INSET, bottom - height, width - HIT_INSET * 2, height,
      )
    ) {
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
    score,
    legPhase: state.legPhase + travelled,
  };
};
