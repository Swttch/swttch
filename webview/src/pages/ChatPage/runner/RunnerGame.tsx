import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GROUND_Y,
  PIXEL,
  RUNNER_X,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createState,
  jump,
  obstacleHeight,
  releaseJump,
  setDucking,
  startRun,
  step,
  type RunnerState,
} from './engine';
import {
  DORONGI,
  DORONGI_DUCKING,
  DORONGI_DUCKING_RUNNING,
  DORONGI_JUMPING,
  DORONGI_RUNNING,
  REEF_PALETTE,
  drawGrid,
} from './sprites';
import { useStash } from './useStash';
import { useBestScore } from './useBestScore';

/** Distance covered per running-frame swap, in world units. */
const STRIDE = 30;
/** Clamps the simulation step so a backgrounded tab cannot teleport obstacles. */
const MAX_FRAME_SECONDS = 1 / 30;

export const runnerSprite = (state: RunnerState, striding: boolean) => {
  if (state.phase !== 'running') return state.ducking ? DORONGI_DUCKING : DORONGI;
  if (state.y > 0) return state.ducking ? DORONGI_DUCKING : DORONGI_JUMPING;
  if (state.ducking) return striding ? DORONGI_DUCKING : DORONGI_DUCKING_RUNNING;
  return striding ? DORONGI : DORONGI_RUNNING;
};

interface RunnerGameProps {
  onExit: () => void;
  /** Called while the game is stashed, so the caller can show the chat instead. */
  onStashedChange?: (stashed: boolean) => void;
  /** Receives a callback that brings a stashed game back, still paused. */
  onRevealRef?: (reveal: () => void) => void;
}

/**
 * An endless runner along a reef: hop the coral and shells, and duck the
 * seahorses hanging overhead — some of which spit ink once the run gets long.
 *
 * Everything is painted from the pixel grids in ./sprites — there are no image
 * assets, no audio, and no game library, so the whole feature costs only its
 * own source. Game rules live in ./engine; this component owns the animation
 * frame loop, input, and painting.
 */
export const RunnerGame = ({ onExit, onStashedChange, onRevealRef }: RunnerGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<RunnerState>(createState());
  /** Mirrors phase into React only so the caption can re-render. */
  const [phase, setPhase] = useState(stateRef.current.phase);
  const [score, setScore] = useState(0);

  const { best, report } = useBestScore();
  /** Read inside the frame loop, which must not restart when the score changes. */
  const reportRef = useRef(report);
  reportRef.current = report;

  const stash = useStash();
  /** Read inside the frame loop, which must not restart when this changes. */
  const stashRef = useRef(stash.state);
  stashRef.current = stash.state;

  useEffect(() => {
    onStashedChange?.(stash.state === 'hidden');
  }, [stash.state, onStashedChange]);

  useEffect(() => {
    onRevealRef?.(stash.reveal);
  }, [onRevealRef, stash.reveal]);

  const press = useCallback(() => {
    // While stashed, only the Ctrl double-tap is live.
    if (stashRef.current === 'hidden') return;
    if (stashRef.current === 'paused') {
      stash.resume();
      return;
    }
    const state = stateRef.current;
    if (state.phase === 'running') {
      stateRef.current = jump(state);
      return;
    }
    // 'ready' and 'over' both start a fresh run.
    stateRef.current = startRun();
    setPhase('running');
    setScore(0);
  }, [stash]);

  const release = useCallback(() => {
    stateRef.current = releaseJump(stateRef.current);
  }, []);

  const duck = useCallback((ducking: boolean) => {
    if (stashRef.current !== 'playing') return;
    stateRef.current = setDucking(stateRef.current, ducking);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const seabedColor = getComputedStyle(canvas).getPropertyValue('--color-text-tertiary').trim() || '#a3a3a3';

    let frame = 0;
    let previous = performance.now();
    let cssWidth = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const ratio = window.devicePixelRatio || 1;
      cssWidth = Math.min(WORLD_WIDTH, parent.clientWidth);
      const cssHeight = (cssWidth / WORLD_WIDTH) * WORLD_HEIGHT;
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

      ctx.fillStyle = seabedColor;
      ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, 1);

      for (const obstacle of state.obstacles) {
        drawGrid(
          ctx,
          obstacle.grid,
          obstacle.x,
          GROUND_Y - obstacle.y - obstacleHeight(obstacle.grid),
          PIXEL,
          REEF_PALETTE,
        );
      }

      const striding = Math.floor(state.legPhase / STRIDE) % 2 === 0;
      const grid = runnerSprite(state, striding);
      drawGrid(ctx, grid, RUNNER_X, GROUND_Y - obstacleHeight(grid) - state.y, PIXEL, REEF_PALETTE);
    };

    const loop = (now: number) => {
      const dt = Math.min(MAX_FRAME_SECONDS, (now - previous) / 1000);
      previous = now;

      // Stashing freezes the world; only the Ctrl listener stays live. The
      // canvas keeps its last frame, so bringing the game back shows exactly
      // where it left off.
      if (stashRef.current === 'playing') {
        const before = stateRef.current;
        const grid = runnerSprite(before, true);
        const after = step(before, { dt, runnerGrid: grid });
        stateRef.current = after;

        if (after.phase !== before.phase) {
          setPhase(after.phase);
          // The backend keeps the score only if it beats the stored best, so a
          // finished run can be reported without comparing here.
          if (after.phase === 'over') void reportRef.current(after.score);
        }
        if (after.score !== before.score) setScore(after.score);
        render(after);
      }

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
      // Nothing but the Ctrl double-tap reaches a stashed game.
      if (stashRef.current === 'hidden') return;
      if (event.key === 'Escape') {
        onExit();
        return;
      }
      if (event.code === 'Space' || event.key === 'ArrowUp') {
        // Space would otherwise scroll the chat behind the game.
        event.preventDefault();
        press();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        duck(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (stashRef.current === 'hidden') return;
      if (event.code === 'Space' || event.key === 'ArrowUp') release();
      if (event.key === 'ArrowDown') duck(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onExit, press, release, duck]);

  const hidden = stash.state === 'hidden';

  const caption = stash.state === 'paused' ? 'Paused — Space to resume'
    : phase === 'ready' ? 'Space to start, Down to duck'
    : phase === 'over' ? 'Game over — Space to retry, Esc to leave'
    : 'Esc to leave';

  return (
    // Stashing hides the game without unmounting it: the canvas keeps the frame
    // it froze on, so revealing shows the run exactly as it was left.
    <div
      className={`flex flex-col items-center gap-2 w-full transition-opacity ${
        hidden ? 'opacity-0 pointer-events-none absolute' : ''
      }`}
      aria-hidden={hidden}
    >
      <div className="flex w-full max-w-[600px] justify-end gap-4 font-mono text-xs text-text-tertiary tabular-nums">
        {best > 0 && <span>best {best}</span>}
        <span>{score}</span>
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
