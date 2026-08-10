import { describe, expect, it } from 'vitest';
import { RUNNER_X, createState, jump, startRun, step, type RunnerState } from '../engine';
import { RUNNER_STANDING } from '../sprites';

const FRAME = 1 / 60;

/**
 * Plays a full run the way a competent player would: jump once an obstacle is
 * close enough that the arc peaks over it. If the game were unwinnable — a gap
 * too tight to clear, or a jump too short — this would end early.
 */
describe('runner playthrough', () => {
  it('survives a long run when obstacles are jumped at the right moment', () => {
    let state: RunnerState = startRun(createState());
    let random = 0;
    // A fixed pseudo-random sequence keeps the run reproducible.
    const nextRandom = () => {
      random = (random * 9301 + 49297) % 233280;
      return random / 233280;
    };

    let jumps = 0;
    for (let frame = 0; frame < 60 * 60; frame++) {
      const ahead = state.obstacles
        .map((obstacle) => obstacle.x - RUNNER_X)
        .filter((gap) => gap > 0)
        .sort((a, b) => a - b)[0];

      // Leap when the obstacle is roughly a jump's length away. The window
      // scales with speed because a faster world closes the gap sooner.
      if (ahead !== undefined && state.y === 0) {
        const window = state.speed * 0.34;
        if (ahead < window) {
          state = jump(state);
          jumps++;
        }
      }

      state = step(state, { dt: FRAME, runnerGrid: RUNNER_STANDING, random: nextRandom });
      if (state.phase === 'over') break;
    }

    expect(state.phase).toBe('running');
    expect(jumps).toBeGreaterThan(5);
    expect(state.score).toBeGreaterThan(50);
  });

  it('ends the run when the player never jumps', () => {
    let state: RunnerState = startRun(createState());
    for (let frame = 0; frame < 60 * 60 && state.phase === 'running'; frame++) {
      state = step(state, { dt: FRAME, runnerGrid: RUNNER_STANDING, random: () => 0.5 });
    }
    expect(state.phase).toBe('over');
  });
});
