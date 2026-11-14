/**
 * The bubble a sent message sits in, in the Transcript views: measured on the desktop app's own screen, a one-line
 * bubble is 46px tall and a two-line one 68px (at this app's 90% scale: 13.5px above and below, 16.8px at the sides).
 * One class for every place that draws one (a sent message, one held under a permission card, one waiting for its
 * turn to end), so they cannot drift apart.
 */
export const USER_BUBBLE_CLASS = 'max-w-[37rem] min-w-0 rounded-2xl bg-surface-hover px-[16.8px] py-[13.5px]';
