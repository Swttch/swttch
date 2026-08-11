import clawdSvg from '../../assets/clawd.svg';
import dorongiSvg from '../../assets/dorongi.svg';
import { useSecretKnock } from './runner/useSecretKnock';

const noop = () => {};

const CLAWD_WIDTH = 46;
const CLAWD_HEIGHT = 37;
const DORONGI_SIZE = 56;
/** Horizontal gap between Clawd and Dorongi; the leash spans it. */
const GAP = 20;

const LEASH_COLOR = '#E5484D';
const LEASH_WIDTH = 2;

/** Clawd is an 11x4 pixel grid; Dorongi is 12x12. */
const CLAWD_ROW = CLAWD_HEIGHT / 4;
const DORONGI_CELL = DORONGI_SIZE / 12;

/**
 * clawd.svg leaves ~0.92 units of padding below its artwork inside a 38-unit
 * viewBox, while dorongi.svg fills its box edge to edge. Aligning the <image>
 * boxes would therefore leave Clawd hovering, so this offset drops it until the
 * two sets of feet land on the same line.
 */
const CLAWD_BOTTOM_PADDING = (38 - 37.0769) * (CLAWD_HEIGHT / 38);

/**
 * Optical correction. Dorongi's feet are two narrow stubs while Clawd stands on
 * four wide ones, so a geometrically exact ground line still reads as Dorongi
 * sinking into it. Lifting it a single pixel settles the pair.
 */
const DORONGI_OPTICAL_LIFT = 1;

/**
 * Clawd on a leash, walked by Dorongi standing to its right.
 *
 * Drawn as one SVG so the leash can cross from Clawd's collar to Dorongi's
 * hand: the two mascots are embedded as <image> at their natural pixel sizes
 * and the leash is stroked on top in the same coordinate space.
 *
 * Both characters have feet on the last row of their own grid, so their ground
 * line comes from aligning artwork bottoms rather than <image> boxes — see the
 * two offsets above.
 */
interface ClawdWalkProps {
  /**
   * Called when Dorongi is clicked four times in quick succession; absent when
   * nothing should happen.
   */
  onDorongiKnock?: () => void;
}

export const ClawdWalk = ({ onDorongiKnock }: ClawdWalkProps) => {
  const knock = useSecretKnock(onDorongiKnock ?? noop);

  const width = CLAWD_WIDTH + GAP + DORONGI_SIZE;
  const height = Math.max(CLAWD_HEIGHT, DORONGI_SIZE) + CLAWD_BOTTOM_PADDING;

  const clawdY = height - CLAWD_HEIGHT + CLAWD_BOTTOM_PADDING;
  const dorongiX = CLAWD_WIDTH + GAP;
  const dorongiY = height - DORONGI_SIZE - DORONGI_OPTICAL_LIFT;

  // The collar crosses Clawd just under the eye row.
  const collarY = clawdY + CLAWD_ROW * 2;
  const collarLeft = CLAWD_WIDTH * 0.07;
  const collarRight = CLAWD_WIDTH * 0.95;

  // Dorongi faces left, so the arm nearest Clawd is the one that holds the lead.
  // That arm is the single cell jutting out at grid column 2 of row 9, and the
  // leash ends on its outer tip so it reads as being gripped rather than
  // stopping short in mid-air.
  const handX = dorongiX + DORONGI_CELL * 2;
  const handY = dorongiY + DORONGI_CELL * 9.5;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Clawd"
    >
      <image href={clawdSvg} x={0} y={clawdY} width={CLAWD_WIDTH} height={CLAWD_HEIGHT} />
      <image href={dorongiSvg} x={dorongiX} y={dorongiY} width={DORONGI_SIZE} height={DORONGI_SIZE} />

      {/* Collar around Clawd, then the lead running to Dorongi's hand. */}
      <path
        d={`M${collarLeft} ${collarY} H${collarRight} Q${(collarRight + handX) / 2} ${collarY + 2} ${handX} ${handY}`}
        stroke={LEASH_COLOR}
        strokeWidth={LEASH_WIDTH}
        strokeLinecap="round"
        fill="none"
      />

      {/* Transparent hit area over Dorongi, drawn last so it takes the clicks.
          It keeps the default cursor: a pointer would advertise the secret. */}
      {onDorongiKnock && (
        <rect
          x={dorongiX}
          y={dorongiY}
          width={DORONGI_SIZE}
          height={DORONGI_SIZE}
          fill="transparent"
          className="select-none"
          onClick={knock}
        />
      )}
    </svg>
  );
};
