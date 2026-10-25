/** The message the probe below sends to the pane: the colour the page paints its canvas with. */
export const PAGE_BACKGROUND_MESSAGE = 'ccg-page-background';

/**
 * A page is drawn in a frame the pane cannot look into, and its own colours are
 * its own: a dark page and a white one sit in the same card. So the page is
 * handed one line that reports its background back, and the pane paints its
 * header in that colour, which leaves no seam between the bar and the page, as
 * Claude Desktop's artifact pane has none. The line only reports; it changes
 * nothing in the page.
 */
const PROBE = `<script>(function(){function r(){var s=getComputedStyle(document.body).backgroundColor;if(!s||s==='transparent'||/rgba\\(.*,\\s*0\\)$/.test(s))s=getComputedStyle(document.documentElement).backgroundColor;if(!s||s==='transparent'||/rgba\\(.*,\\s*0\\)$/.test(s))s='rgb(255, 255, 255)';parent.postMessage({type:'${PAGE_BACKGROUND_MESSAGE}',color:s},'*')}if(document.readyState==='complete')r();else addEventListener('load',r);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',r)})()</script>`;

export function withBackgroundProbe(html: string): string {
  return html + PROBE;
}

/** Whether black text reads better than white on this `rgb(...)` colour; undefined when the colour is not one. */
export function isLightColor(color: string): boolean | undefined {
  const match = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(color);
  if (!match) return undefined;
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}
