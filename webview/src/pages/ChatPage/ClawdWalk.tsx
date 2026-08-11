import clawdSvg from '../../assets/clawd.svg';
import dorongiSvg from '../../assets/dorongi.svg';
import { useSecretKnock } from './runner/useSecretKnock';

const noop = () => {};

/**
 * An arc from a head up to the heart, pulled back at both ends so the dots
 * float free instead of touching either.
 *
 * The curve is a quadratic whose control point sits above the midpoint, which
 * bows it outward; the endpoints are then walked along the straight line by the
 * clearances, which is close enough to the curve at this scale.
 */
const heartTrail = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  fromClearance: number,
  toClearance: number,
) => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;

  const startX = fromX + ux * fromClearance;
  const startY = fromY + uy * fromClearance;
  const endX = toX - ux * toClearance;
  const endY = toY - uy * toClearance;

  // Bow the arc away from the heads, upward and outward from the midpoint.
  const controlX = (startX + endX) / 2 + ux * 2;
  const controlY = Math.min(startY, endY) - length * 0.28;

  return `M${startX.toFixed(2)} ${startY.toFixed(2)} Q${controlX.toFixed(2)} ${controlY.toFixed(2)} ${endX.toFixed(2)} ${endY.toFixed(2)}`;
};

const CLAWD_WIDTH = 46;
const CLAWD_HEIGHT = 37;
const DORONGI_SIZE = 56;
/** Horizontal gap between Clawd and Dorongi. */
const GAP = 20;

const HEART_COLOR = '#E5484D';
/** Half the heart's width; it is drawn around its own centre. */
const HEART_RADIUS = 3.4;
/** Headroom above the taller character for the heart and its arcs. */
const HEART_HEADROOM = 15;

const TRAIL_COLOR = '#E5484D';
const TRAIL_WIDTH = 1.2;
/** Small dots with wide gaps, so the trail reads as a light dotted arc. */
const TRAIL_DASH = '0.1 3';
/** The arcs stop short of both the heads and the heart, never touching either. */
const TRAIL_HEAD_CLEARANCE = 5;
const TRAIL_HEART_CLEARANCE = 4;

/**
 * clawd.svg leaves ~0.92 units of padding below its artwork inside a 38-unit
 * viewBox, while dorongi.svg fills its box edge to edge. Aligning the <image>
 * boxes would therefore leave Clawd hovering, so this offset drops it until the
 * two sets of feet land on the same line.
 */
const CLAWD_BOTTOM_PADDING = (38 - 37.0769) * (CLAWD_HEIGHT / 38);

/** The matching gap above clawd.svg's artwork, where its arc has to start. */
const CLAWD_TOP_PADDING = 0.938461 * (CLAWD_HEIGHT / 38);

/**
 * Dorongi's head is not centred on its body — it sits toward the front, in the
 * direction it faces — so its arc springs from here rather than the midpoint.
 * Taken from the crown of the 12x12 grid.
 */
const DORONGI_HEAD_CENTRE = 7 / 12;

/**
 * Optical correction. Dorongi's feet are two narrow stubs while Clawd stands on
 * four wide ones, so a geometrically exact ground line still reads as Dorongi
 * sinking into it. Lifting it a single pixel settles the pair.
 */
const DORONGI_OPTICAL_LIFT = 1;

/**
 * Clawd and Dorongi side by side, with a little heart floating between them.
 *
 * Drawn as one SVG so the dotted arcs can run from head to heart across both
 * characters: the two mascots are embedded as <image> at their natural pixel
 * sizes and everything else is stroked on top in the same coordinate space.
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
  const groundLine = Math.max(CLAWD_HEIGHT, DORONGI_SIZE) + CLAWD_BOTTOM_PADDING;
  const height = groundLine + HEART_HEADROOM;

  const clawdY = HEART_HEADROOM + groundLine - CLAWD_HEIGHT + CLAWD_BOTTOM_PADDING;
  const dorongiX = CLAWD_WIDTH + GAP;
  const dorongiY = HEART_HEADROOM + groundLine - DORONGI_SIZE - DORONGI_OPTICAL_LIFT;

  // The heart floats above both heads, midway between them rather than at the
  // centre of the drawing — the two heads are not symmetric about that.
  const heartY = HEART_HEADROOM / 2;

  // Each arc springs from the crown of a head. Neither is the centre of its
  // box: clawd.svg carries padding above its artwork, and Dorongi's head sits
  // off to one side of its body, so both are measured from the grids instead.
  const clawdHeadX = CLAWD_WIDTH / 2;
  const clawdHeadY = clawdY + CLAWD_TOP_PADDING;
  const dorongiHeadX = dorongiX + DORONGI_SIZE * DORONGI_HEAD_CENTRE;
  const dorongiHeadY = dorongiY;

  const heartX = (clawdHeadX + dorongiHeadX) / 2;

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

      {/* A dotted arc rising from each head to the heart between them. */}
      <g
        stroke={TRAIL_COLOR}
        strokeWidth={TRAIL_WIDTH}
        strokeDasharray={TRAIL_DASH}
        strokeLinecap="round"
        fill="none"
      >
        <path
          d={heartTrail(
            clawdHeadX, clawdHeadY, heartX, heartY,
            TRAIL_HEAD_CLEARANCE, TRAIL_HEART_CLEARANCE,
          )}
        />
        <path
          d={heartTrail(
            dorongiHeadX, dorongiHeadY, heartX, heartY,
            TRAIL_HEAD_CLEARANCE, TRAIL_HEART_CLEARANCE,
          )}
        />
      </g>

      {/* The heart itself: two lobes over a point. */}
      <path
        d={`M${heartX} ${heartY + HEART_RADIUS}
            C${heartX - HEART_RADIUS * 1.5} ${heartY - HEART_RADIUS * 0.35}
             ${heartX - HEART_RADIUS * 0.5} ${heartY - HEART_RADIUS * 1.35}
             ${heartX} ${heartY - HEART_RADIUS * 0.35}
            C${heartX + HEART_RADIUS * 0.5} ${heartY - HEART_RADIUS * 1.35}
             ${heartX + HEART_RADIUS * 1.5} ${heartY - HEART_RADIUS * 0.35}
             ${heartX} ${heartY + HEART_RADIUS}
            Z`}
        fill={HEART_COLOR}
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
