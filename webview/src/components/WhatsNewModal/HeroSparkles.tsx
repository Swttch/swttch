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
  opacity: number;
}

/**
 * Two constraints shape the table. Both flanks stay outside x 28–72%, the
 * column the title and version line occupy, and everything stays above y 58%,
 * clear of the promo row at the hero's foot. A glyph inside either band reads
 * as debris on top of the text rather than as a backdrop behind it.
 */
const SPARKLES: Sparkle[] = [
  { x: 5, y: 30, glyph: 4, size: 1.0, opacity: 0.22 },
  { x: 11, y: 52, glyph: 0, size: 0.7, opacity: 0.16 },
  { x: 17, y: 12, glyph: 1, size: 0.8, opacity: 0.14 },
  { x: 22, y: 38, glyph: 0, size: 0.65, opacity: 0.12 },
  { x: 26, y: 20, glyph: 5, size: 0.85, opacity: 0.15 },
  { x: 75, y: 16, glyph: 1, size: 0.8, opacity: 0.14 },
  { x: 80, y: 46, glyph: 4, size: 0.95, opacity: 0.18 },
  { x: 85, y: 24, glyph: 0, size: 0.65, opacity: 0.12 },
  { x: 90, y: 54, glyph: 5, size: 1.0, opacity: 0.16 },
  { x: 95, y: 32, glyph: 0, size: 0.7, opacity: 0.15 },
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
            opacity: s.opacity,
          }}
        >
          {BASE_FRAMES[s.glyph]}
        </span>
      ))}
    </div>
  );
}
