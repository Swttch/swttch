/**
 * Window events that open header-owned surfaces from anywhere.
 *
 * A dock item can be triggered from two places — its icon in the dock, or its row
 * in the ⋮ overflow menu — and the menu unmounts the moment it closes. So a
 * surface that must outlive its trigger (a modal) cannot keep its open state
 * inside the trigger component: dragging the item out of the dock would remove
 * the only component able to show it.
 *
 * Instead the surface lives at the app shell and listens here, mirroring how
 * OPEN_ACCOUNT_USAGE_EVENT already lets the header, the command palette, a slash
 * command, and the stream context all open one usage modal.
 */

/** Ask the app shell to open the remote-tunnel modal. */
export const OPEN_TUNNEL_EVENT = 'open-tunnel-modal';
