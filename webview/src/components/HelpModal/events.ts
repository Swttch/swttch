/**
 * Window events that drive the help modal.
 *
 * The shortcut lives in the keyboard registry and the palette item lives in the
 * command palette, and neither owns the modal's state. They announce what the
 * user asked for and HelpModalHost, which does own it, decides what that means.
 */

/** Cmd/Ctrl+/ : open the modal, or close it when it is already open. */
export const TOGGLE_HELP_EVENT = 'toggle-help';

/** A palette item was chosen : open the modal and leave it open if it already is. */
export const OPEN_HELP_EVENT = 'open-help';
