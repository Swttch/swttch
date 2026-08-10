import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GROUND_Y,
  PIXEL,
  RUNNER_X,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createState,
  jump,
  releaseJump,
  runnerHeight,
  startRun,
  step,
  type RunnerState,
} from './engine';
import { RUNNER_JUMPING, RUNNER_RUNNING, RUNNER_STANDING, drawGrid } from './sprites';

const BEST_SCORE_KEY = 'ccg.runner.best';

/** Distance covered per running-frame swap, in world units. */
const STRIDE = 30;
/** Clamps the simulation step so a backgrounded tab cannot teleport obstacles. */
const MAX_FRAME_SECONDS = 1 / 30;

const readBest = () => {
  const stored = Number(localStorage.getItem(BEST_SCORE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
};

interface RunnerGameProps {
  onExit: () => void;
}

/**
 * A Chrome-dino-style endless runner, drawn on a 2D canvas.
 *
 * Everything is painted from the pixel grids in ./sprites — there are no image
 * assets, no audio, and no game library, so the whole feature costs only its
 * own source. Game rules live in ./engine; this component owns the animation
 * frame loop, input, and painting.
 */
export const RunnerGame = ({ onExit }: RunnerGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<RunnerState>(createState(readBest()));
  /** Mirrors phase into React only so the caption can re-render. */
  const [phase, setPhase] = useState(stateRef.current.phase);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(stateRef.current.best);

  const colorsRef = useRef({ ink: '#525252', muted: '#a3a3a3' });

  const press = useCallback(() => {
    const state = stateRef.current;
    if (state.phase === 'running') {
      stateRef.current = jump(state);
      return;
    }
    // 'ready' and 'over' both start a fresh run.
    stateRef.current = startRun(state);
    setPhase('running');
    setScore(0);
  }, []);

  const release = useCallback(() => {
    stateRef.current = releaseJump(stateRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resolve theme colors once per mount rather than every frame.
    const styles = getComputedStyle(canvas);
    colorsRef.current = {
      ink: styles.getPropertyValue('--color-text-secondary').trim() || '#525252',
      muted: styles.getPropertyValue('--color-text-tertiary').trim() || '#a3a3a3',
    };

    let frame = 0;
    let previous = performance.now();
    let cssWidth = 0;
    let cssHeight = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const ratio = window.devicePixelRatio || 1;
      cssWidth = Math.min(WORLD_WIDTH, parent.clientWidth);
      cssHeight = (cssWidth / WORLD_WIDTH) * WORLD_HEIGHT;
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const render = (state: RunnerState) => {
      const ratio = window.devicePixelRatio || 1;
      const scale = (cssWidth / WORLD_WIDTH) * ratio;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      const { ink, muted } = colorsRef.current;

      // Ground line.
      ctx.fillStyle = muted;
      ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, 1);

      for (const obstacle of state.obstacles) {
        drawGrid(ctx, obstacle.grid, obstacle.x, GROUND_Y - runnerHeight(obstacle.grid), PIXEL, ink);
      }

      const airborne = state.y > 0;
      const striding = Math.floor(state.legPhase / STRIDE) % 2 === 0;
      const grid = state.phase !== 'running' ? RUNNER_STANDING
        : airborne ? RUNNER_JUMPING
        : striding ? RUNNER_STANDING
        : RUNNER_RUNNING;

      drawGrid(ctx, grid, RUNNER_X, GROUND_Y - runnerHeight(grid) - state.y, PIXEL, ink);
    };

    const loop = (now: number) => {
      const dt = Math.min(MAX_FRAME_SECONDS, (now - previous) / 1000);
      previous = now;

      const before = stateRef.current;
      const after = step(before, { dt, runnerGrid: RUNNER_STANDING });
      stateRef.current = after;

      if (after.phase !== before.phase) {
        setPhase(after.phase);
        if (after.phase === 'over') {
          setBest(after.best);
          localStorage.setItem(BEST_SCORE_KEY, String(after.best));
        }
      }
      if (after.score !== before.score) setScore(after.score);

      render(after);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onExit();
        return;
      }
      if (event.code === 'Space' || event.key === 'ArrowUp') {
        // Space would otherwise scroll the chat behind the game.
        event.preventDefault();
        press();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === 'ArrowUp') release();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onExit, press, release]);

  const caption = phase === 'ready' ? 'Press Space to start'
    : phase === 'over' ? 'Game over — Space to retry, Esc to leave'
    : 'Esc to leave';

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="flex w-full max-w-[600px] justify-end gap-4 font-mono text-xs text-text-tertiary tabular-nums">
        {best > 0 && <span>HI {String(best).padStart(5, '0')}</span>}
        <span>{String(score).padStart(5, '0')}</span>
      </div>
      <div className="w-full max-w-[600px]">
        <canvas
          ref={canvasRef}
          className="block w-full cursor-pointer touch-none"
          onPointerDown={press}
          onPointerUp={release}
        />
      </div>
      <p className="text-text-tertiary text-xs">{caption}</p>
    </div>
  );
};
