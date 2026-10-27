/** The message the probe below sends to the pane: the colour the page paints its canvas with. */
export const PAGE_BACKGROUND_MESSAGE = 'ccg-page-background';

/**
 * A page is drawn in a frame the pane cannot look into, and its own colours are
 * its own: a dark page and a white one sit in the same card. So the page is
 * handed one line that reports its background back, and the pane paints its
 * card in that colour, which leaves no seam of another colour at the card's rounded edge. The line only reports; it changes
 * nothing in the page.
 */
const PROBE = `<script>(function(){function r(){var s=getComputedStyle(document.body).backgroundColor;if(!s||s==='transparent'||/rgba\\(.*,\\s*0\\)$/.test(s))s=getComputedStyle(document.documentElement).backgroundColor;if(!s||s==='transparent'||/rgba\\(.*,\\s*0\\)$/.test(s))s='rgb(255, 255, 255)';parent.postMessage({type:'${PAGE_BACKGROUND_MESSAGE}',color:s},'*')}if(document.readyState==='complete')r();else addEventListener('load',r);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',r)})()</script>`;

export function withBackgroundProbe(html: string): string {
  return html + PROBE;
}
