import { BASE_FRAMES } from '@/pages/ChatPage/StreamingIndicator/constants';

/**
 * The scattered glyphs behind the modal's title.
 *
 * They are the same characters the streaming indicator cycles through, so the
 * decoration is the app's own visual language rather than generic clip art, and
 * it needs no asset to ship.
 *
 * Positions are a fixed table, not random: a re-render must not reshuffle the
 * sky while the reader is paging through releases.
 */
interface Sparkle {
  /** Percent from the inline start edge. */
  x: number;
  /** Percent from the top edge. */
  y: number;
  /** Index into BASE_FRAMES. */
  glyph: number;
  /** rem */
  size: number;
  /**
   * How strongly this glyph shows, relative to its neighbours, from 0 to 1.
   *
   * Relative rather than absolute because the ceiling is per theme: the accent
   * is a mid-tone that brightens the dark surface but only darkens white, so
   * the two need different amounts of it to read the same. `--sparkle-alpha`
   * in index.css holds that ceiling and this scales it.
   */
  weight: number;
}

/**
 * Two constraints shape the table. Both flanks stay outside x 28–72%, the
 * column the title and version line occupy, and everything stays above y 58%,
 * clear of the promo row at the hero's foot. A glyph inside either band reads
 * as debris on top of the text rather than as a backdrop behind it.
 */
const SPARKLES: Sparkle[] = [
  { x: 5, y: 30, glyph: 4, size: 1.0, weight: 1.0 },
  { x: 11, y: 52, glyph: 0, size: 0.7, weight: 0.72 },
  { x: 17, y: 12, glyph: 1, size: 0.8, weight: 0.64 },
  { x: 22, y: 38, glyph: 0, size: 0.65, weight: 0.55 },
  { x: 26, y: 20, glyph: 5, size: 0.85, weight: 0.68 },
  { x: 75, y: 16, glyph: 1, size: 0.8, weight: 0.64 },
  { x: 80, y: 46, glyph: 4, size: 0.95, weight: 0.82 },
  { x: 85, y: 24, glyph: 0, size: 0.65, weight: 0.55 },
  { x: 90, y: 54, glyph: 5, size: 1.0, weight: 0.72 },
  { x: 95, y: 32, glyph: 0, size: 0.7, weight: 0.68 },
];

export function HeroSparkles() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden select-none">
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="absolute text-accent-claude leading-none"
          style={{
            insetInlineStart: `${s.x}%`,
            top: `${s.y}%`,
            fontSize: `${s.size}rem`,
            opacity: `calc(var(--sparkle-alpha) * ${s.weight})`,
          }}
        >
          {BASE_FRAMES[s.glyph]}
        </span>
      ))}
    </div>
  );
}
