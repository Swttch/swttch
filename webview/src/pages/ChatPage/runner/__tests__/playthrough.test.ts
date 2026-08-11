import { describe, expect, it } from 'vitest';
import {
  INK_SCORE,
  RUNNER_X,
  SEAHORSE_SCORE,
  difficultyRatio,
  jump,
  obstacleHeight,
  obstacleWidth,
  runnerHeight,
  setDucking,
  startRun,
  step,
  type RunnerState,
} from '../engine';
import { DORONGI_DUCKING, DORONGI } from '../sprites';

const FRAME = 1 / 60;

/** A fixed pseudo-random sequence, so a run is reproducible. */
const seeded = (seed = 0) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};

interface RunResult {
  state: RunnerState;
  jumps: number;
  ducks: number;
}

/**
 * Plays like a competent player: jump what can be jumped, duck under what
 * rides overhead, and stand back up once it has passed.
 */
const playFor = (frames: number, random = seeded()): RunResult => {
  let state = startRun();
  let jumps = 0;
  let ducks = 0;
  let wasDucking = false;

  for (let frame = 0; frame < frames && state.phase === 'running'; frame++) {
    const runnerTop = runnerHeight(DORONGI);
    // The nearest thing not yet fully behind the runner. An obstacle still
    // overlapping counts, so the bot holds its pose until the way is clear
    // rather than standing up into something it is halfway past.
    const threat = state.obstacles
      .filter((obstacle) => obstacle.x + obstacleWidth(obstacle.grid) > RUNNER_X)
      .sort((a, b) => a.x - b.x)[0];

    if (threat) {
      const gap = threat.x - RUNNER_X;
      // Anything whose whole body sits above a ducking runner can be slipped
      // under; everything else has to be jumped.
      const clearsWhenDucked = threat.y > obstacleHeight(DORONGI_DUCKING) - 6;

      if (clearsWhenDucked) {
        const shouldDuck = gap < 140;
        if (shouldDuck !== wasDucking) {
          state = setDucking(state, shouldDuck);
          wasDucking = shouldDuck;
          if (shouldDuck) ducks++;
        }
      } else {
        if (wasDucking) {
          state = setDucking(state, false);
          wasDucking = false;
        }
        // Leap when the arc will peak over the obstacle, not the moment it
        // appears — jumping too early lands right on top of it.
        if (state.y === 0 && gap > 0 && gap < state.speed * 0.34 && gap > runnerTop * 0.4) {
          state = jump(state);
          jumps++;
        }
      }
    } else if (wasDucking) {
      state = setDucking(state, false);
      wasDucking = false;
    }

    state = step(state, { dt: FRAME, runnerGrid: wasDucking ? DORONGI_DUCKING : DORONGI, random });
  }

  return { state, jumps, ducks };
};

describe('runner playthrough', () => {
  it('is survivable through the seahorse stage when played well', () => {
    // Long enough to pass the score where seahorses start appearing.
    const { state, jumps, ducks } = playFor(60 * 25);

    expect(state.phase).toBe('running');
    expect(state.score).toBeGreaterThan(SEAHORSE_SCORE);
    expect(jumps).toBeGreaterThan(5);
    // Seahorses ride high enough that ducking is the answer at least once.
    expect(ducks).toBeGreaterThan(0);
  });

  it('ends the run when the player never reacts', () => {
    let state = startRun();
    for (let frame = 0; frame < 60 * 60 && state.phase === 'running'; frame++) {
      state = step(state, { dt: FRAME, runnerGrid: DORONGI, random: () => 0.5 });
    }
    expect(state.phase).toBe('over');
  });

  it('tightens the spacing as the score climbs', () => {
    expect(difficultyRatio(0)).toBe(0);
    expect(difficultyRatio(INK_SCORE)).toBeGreaterThan(0);
    expect(difficultyRatio(10_000)).toBe(1);
  });
});
