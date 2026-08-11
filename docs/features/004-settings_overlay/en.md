# Settings Overlay

> Languages: **English** · [한국어](./ko.md)
>
> Related: [PR #137](https://github.com/Swttch/swttch/pull/137)

## What's new

**Opening Settings no longer interrupts a running session.** Previously, clicking the gear replaced the whole chat view, which **stopped a session that was streaming a response** and reset the chat state. Settings now appears **as an overlay on top of your current chat**, so the session underneath stays alive.

## Details

### Settings open as an overlay

- Clicking the **Settings (gear) button** in the header shows Settings as an overlay over your current chat.
- While the overlay is up, **the chat underneath stays mounted**. A response that was streaming keeps going without interruption.
- You can close the overlay three ways:
  - The **X button** in the top-right corner
  - The **Esc key**
  - Clicking the **backdrop** (outside the overlay)
- Closing it returns you to your original session **in one step**, no matter which Settings sub-screen (Account, Usage, etc.) you were on.

### Choose how Settings open (overlay / new tab)

The overlay is the default, but if you prefer the old behavior of **opening Settings in a dedicated tab**, you can switch back.

- Pick **Overlay** or **New tab** under **Settings → General → "Open settings as"**. (Default: Overlay)
- With **New tab**, Settings opens full-screen in a separate editor tab.

## Good to know

- Even when Settings is opened in a dedicated tab, pressing **Back** returns you to the **session you were just viewing**, not a blank one.
- With the overlay, opening and closing Settings doesn't change the current session ID, so none of the screen reset that happens on a session switch occurs.
