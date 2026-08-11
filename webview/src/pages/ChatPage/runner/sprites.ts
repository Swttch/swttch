/**
 * Pixel art as grid strings. A '.' is transparent; every other character is a
 * palette key, so one grid can carry several colors.
 *
 * The runner draws these as filled rects instead of shipping images, which is
 * what keeps the whole easter egg down to a few kilobytes of source and zero
 * network requests.
 */
export type PixelGrid = readonly string[];

/** Maps the characters in a grid to CSS colors. */
export type Palette = Record<string, string>;

/* Palette keys, shared across the sprites below.
 *   g/G  Dorongi's body and its darker shading
 *   e    eye white
 *   c/C  coral, in two tones
 *   s/S  shell, in two tones
 *   h/H  seahorse body and its darker markings
 *   k    ink
 */

export const REEF_PALETTE: Palette = {
  g: '#3FA34D',
  G: '#2C7A3A',
  e: '#F2FBF3',
  c: '#E4735A',
  C: '#B84F3C',
  s: '#E8C9A0',
  S: '#B99771',
  h: '#E8B33F',
  H: '#B8862A',
  k: '#3A3A48',
};

/**
 * Dorongi, facing left. Row 9's outer cells are the arms, rows 10-11 the legs;
 * the two cells at column 7 are the eye.
 */
export const DORONGI: PixelGrid = [
  '....gggggg..',
  '...gggg.ggg.',
  '.ggggggeggg.',
  '.gggggggggg.',
  '.....gggggg.',
  '.ggggggggg..',
  '....GGGGG...',
  '...ggggggg..',
  '..ggggggggg.',
  '..g.ggggg.g.',
  '....G...G...',
  '....G...G...',
];

/** Mid-stride: the legs swap so alternating frames read as running. */
export const DORONGI_RUNNING: PixelGrid = [
  '....gggggg..',
  '...gggg.ggg.',
  '.ggggggeggg.',
  '.gggggggggg.',
  '.....gggggg.',
  '.gggggggggg.',
  '....GGGGG...',
  '...ggggggg..',
  '..ggggggggg.',
  '..g.ggggg.g.',
  '...GG...GG..',
  '..G.......G.',
];

/** Legs tucked for the airborne frame. */
export const DORONGI_JUMPING: PixelGrid = [
  '....gggggg..',
  '...gggg.ggg.',
  '.ggggggeggg.',
  '.gggggggggg.',
  '.....gggggg.',
  '.gggggggggg.',
  '....GGGGG...',
  '...ggggggg..',
  '..ggggggggg.',
  '..g.ggggg.g.',
  '...GG...GG..',
  '............',
];

/**
 * Ducking: a genuinely shorter grid, not the standing one with blank rows on
 * top. Collision uses the grid's full box, so padding rows would still count as
 * body and ducking would clear nothing.
 */
export const DORONGI_DUCKING: PixelGrid = [
  '..gggggg....',
  '.gggg.gggg..',
  'ggggggeggggg',
  '.gggggggggg.',
  '..GGGGGGGG..',
  '...G....G...',
];

export const DORONGI_DUCKING_RUNNING: PixelGrid = [
  '..gggggg....',
  '.gggg.gggg..',
  'ggggggeggggg',
  '.gggggggggg.',
  '..GGGGGGGG..',
  '..G......G..',
];

/* Seabed obstacles. */

/** A clam on the seabed: low, and hopped over easily. */
export const SHELL: PixelGrid = [
  '...ssss...',
  '..ssSSss..',
  '.ssSssSss.',
  'ssSsssssSs',
  'sSssssssSs',
  'SSSSSSSSSS',
];

/** A single coral stalk. */
export const CORAL_SMALL: PixelGrid = [
  '....cc....',
  '..c.cc.c..',
  '..c.cc.cc.',
  '.cc.cc.cc.',
  '.cc.ccCcc.',
  '.cCcccCc..',
  '..CcccC...',
  '...cccc...',
  '...CccC...',
  '...CCCC...',
];

/** A wide coral cluster: the widest thing on the floor. */
export const CORAL_LARGE: PixelGrid = [
  '..cc....cc..',
  '..cc.cc.cc..',
  'c.cc.cc.cc.c',
  'c.cc.cc.cc.c',
  'cccc.cc.cccc',
  '.Ccccccccc..',
  '..CcccccC...',
  '...CccccC...',
  '....CccC....',
  '....CCCC....',
];

/**
 * Seahorse: hangs in the water at one of several heights. It does not swim
 * along — it hovers, and later in a run it spits ink.
 */
export const SEAHORSE: PixelGrid = [
  '..hhhh..',
  '.hh..hh.',
  '.hh.e.h.',
  '.hhhhhh.',
  'Hhhhhh..',
  '.hhhhH..',
  '..hhhH..',
  '..hhhH..',
  '.Hhhh...',
  '..hhH...',
  '.Hhh....',
  '..HHH...',
];

/** Ink spat by a seahorse: small, fast, and fatal on contact. */
export const INK: PixelGrid = [
  '.kk.',
  'kkkk',
  'kkkk',
  '.kk.',
];

export const gridWidth = (grid: PixelGrid) => grid[0].length;
export const gridHeight = (grid: PixelGrid) => grid.length;

/**
 * Paints a grid at (x, y) with each cell scaled to `scale` world units.
 * Runs of the same color are drawn as one rect, which keeps a detailed sprite
 * down to a handful of fill calls per frame.
 */
export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  x: number,
  y: number,
  scale: number,
  palette: Palette,
  /** Overrides every color, for silhouettes. */
  tint?: string,
) => {
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row];
    let col = 0;
    while (col < cells.length) {
      const key = cells[col];
      if (key === '.') {
        col++;
        continue;
      }
      let run = 1;
      while (col + run < cells.length && cells[col + run] === key) run++;
      ctx.fillStyle = tint ?? palette[key] ?? palette.g;
      ctx.fillRect(x + col * scale, y + row * scale, run * scale, scale);
      col += run;
    }
  }
};
