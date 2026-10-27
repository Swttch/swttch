/**
 * Ask the chat page to open or close the session rail. The dock icon and the ⋮
 * menu row both raise it. It lives apart from the panel so the header can raise it
 * without importing the panel and everything the panel draws.
 */
export const TOGGLE_SESSION_RAIL_EVENT = 'toggle-session-rail';
