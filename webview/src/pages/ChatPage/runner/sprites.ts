/**
 * Pixel art as grid strings — '#' is an opaque cell, '.' is transparent.
 *
 * The runner draws these as filled rects instead of shipping images, which is
 * what keeps the whole easter egg down to a few kilobytes of source and zero
 * network requests. A 12x12 character costs 12 short strings.
 */
export type PixelGrid = readonly string[];

/**
 * Dorongi, facing left: head and jaw fill rows 0-5, body rows 6-9 (with arms
 * jutting out at row 9), legs rows 10-11. The gap at column 7 of rows 1-2 is
 * the eye, left unpainted so the background shows through.
 */
export const DORONGI: PixelGrid = [
  '....######..',
  '...####.###.',
  '.######.###.',
  '.##########.',
  '.....######.',
  '.#########..',
  '....#####...',
  '...#######..',
  '..#########.',
  '..#.#####.#.',
  '....#...#...',
  '....#...#...',
];

/** Placeholder runner: a plain block until Dorongi takes over the role. */
export const RUNNER_STANDING: PixelGrid = [
  '............',
  '............',
  '...######...',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '...#....#...',
  '...#....#...',
];

/** Same block with the legs swapped, so alternating frames read as running. */
export const RUNNER_RUNNING: PixelGrid = [
  '............',
  '............',
  '...######...',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..##....##..',
  '.##......##.',
];

/** Legs tucked, for the airborne frame. */
export const RUNNER_JUMPING: PixelGrid = [
  '............',
  '............',
  '...######...',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..########..',
  '..##....##..',
  '............',
];

/** Ground obstacles, in the two widths the spawner alternates between. */
export const CACTUS_SMALL: PixelGrid = [
  '.#..',
  '.#..',
  '###.',
  '.##.',
  '.##.',
  '.##.',
  '.##.',
  '.##.',
];

export const CACTUS_LARGE: PixelGrid = [
  '..#...#..',
  '..#...#..',
  '#.#.#.#.#',
  '###.#.###',
  '.##.#.##.',
  '.#####.#.',
  '..###....',
  '..###....',
];

export const gridWidth = (grid: PixelGrid) => grid[0].length;
export const gridHeight = (grid: PixelGrid) => grid.length;

/**
 * Paints a grid at (x, y) with each cell scaled to `scale` device pixels.
 * Cells are drawn individually rather than as one path — at these grid sizes
 * that is a handful of fillRect calls per frame.
 */
export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  x: number,
  y: number,
  scale: number,
  color: string,
) => {
  ctx.fillStyle = color;
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row];
    for (let col = 0; col < cells.length; col++) {
      if (cells[col] === '#') {
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  }
};
