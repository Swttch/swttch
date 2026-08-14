/** Canvas size, and the space the bars are centred in. */
const SIZE = 20;
/** Bar width, and the gap between bars. */
const BAR = 4;
const GAP = 4;
/** A bar's height at silence, and at full volume. */
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 16;
/**
 * Per-bar height multipliers. The uneven middle-tallest shape reads as a level
 * meter at a glance; three equal bars read as a loading spinner.
 */
const RATIOS = [0.6, 1, 0.75] as const;

const TOTAL_WIDTH = RATIOS.length * BAR + (RATIOS.length - 1) * GAP;
const LEFT = (SIZE - TOTAL_WIDTH) / 2;

interface Props {
  /** Input loudness, 0..1. */
  level: number;
}

/**
 * Three bars that rise with the speaker's voice, shown while recording.
 *
 * This exists because "recording" and "recording silence" look identical
 * otherwise — a muted microphone or the wrong input device only reveals itself
 * when no text ever arrives. The bars make it obvious within a second.
 */
export function AudioLevelBars({ level }: Props) {
  const clamped = Math.max(0, Math.min(1, level));

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
      className="block overflow-visible"
    >
      {RATIOS.map((ratio, i) => {
        const height = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * clamped * ratio;
        return (
          <rect
            key={i}
            x={LEFT + i * (BAR + GAP)}
            y={(SIZE - height) / 2}
            width={BAR}
            height={height}
            rx={BAR / 2}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}
