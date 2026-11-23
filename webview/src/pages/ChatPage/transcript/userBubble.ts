/**
 * The bubble a sent message sits in, in the Transcript views: measured on the desktop app's own screen, a one-line
 * bubble is 46px tall and a two-line one 68px (at this app's 90% scale: 13.5px above and below, 16.8px at the sides).
 * One class for every place that draws one (a sent message, one held under a permission card, one waiting for its
 * turn to end), so they cannot drift apart.
 *
 * The text inside breaks with `overflow-wrap: anywhere`, not `break-words`: a long path with no spaces in it counts
 * for the bubble's own width under `break-words` (it only breaks the word once it overflows), so the bubble grew past
 * the line and, sitting against the right edge, ran off the left of the screen with its first letters cut.
 */
export const USER_BUBBLE_CLASS = 'max-w-[33.3rem] min-w-0 rounded-[0.9rem] bg-surface-hover px-[0.945rem] py-[0.7594rem]';
