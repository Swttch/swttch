# Scheduled Messages

> Languages: **English** · [한국어](./ko.md)
>
> Related: ships on the `feat/auto-resume-on-limit-reset` branch (no PR/issue number yet).

**Scheduled messages** is a Slack-style "send later" for your chat. Write a message now, pick when it should go out, and at that moment the GUI sends it for you — exactly as if you'd typed it and pressed send yourself. Reservations are bound to the session you make them in, and you can list, edit, and cancel them any time.

> **Scheduling is a sponsor feature.** The controls are visible to everyone, so you can try the whole flow, but the actual scheduling happens only for sponsors — the check runs the moment you press **Schedule**. Supporting the project unlocks it; it's a small way to keep the plugin moving, and it flips this on for you.

## Creating a scheduled message

Open the **slash-command panel** (type `/` in the composer), go to the **Context** section, and choose **"Schedule a message…"**. A popover opens right above the composer.

*The slash panel's Context section, with "Schedule a message…".*

![The slash panel Context section showing Schedule a message](./assets/slash-item.png)

The popover has two parts — a **Message** box and a **When** picker — plus the **Schedule** button.

*The create popover: Message, When, and Schedule.*

![The create popover with a message box, a When dropdown, and a Schedule button](./assets/create-popover.png)

A few things make this feel natural:

- **Your draft carries over.** The message box is **pre-filled with whatever you'd already typed** in the composer, so a sentence in progress isn't lost — you finish it here instead.
- **Same editor as the composer.** The message box is the *same* rich editor you type in every day: it auto-grows as you write and is IME-safe (Korean, Japanese, Chinese, and other input methods compose correctly), so nothing feels second-class.

### Choosing when to send

The **When** dropdown offers quick presets plus two open-ended options.

*The When dropdown, open, showing the preset options.*

![The When dropdown open, listing the preset send-time options](./assets/when-dropdown.png)

| Option | What it means |
|--------|---------------|
| **In 5 min** | Now + 5 minutes |
| **In 30 min** | Now + 30 minutes |
| **In 1 hour** | Now + 1 hour |
| **Tomorrow 9 AM** | 09:00 local time tomorrow |
| **After a duration…** | Now + a duration you dial in (days / hours / minutes / seconds) |
| **Custom** | An exact date and time you pick |

Choosing **After a duration…** reveals four small fields — **days**, **hours**, **minutes**, **seconds** — so you can say "send this in 2 hours 30 minutes" precisely.

*The "After a duration" fields: days, hours, minutes, seconds.*

![The After a duration picker with day, hour, minute, and second fields](./assets/after-duration.png)

Choosing **Custom** shows an exact date-and-time field, down to the second.

> **A note on the Custom field.** The exact date-and-time picker is your operating system's native widget, so its layout and wording follow the **OS language**, not the app's interface language. That's expected — it's the same picker your other apps use.

When you're happy with the message and the time, press **Schedule**. (Editing an existing reservation instead? The button reads **Save**.) A confirmation appears and the popover closes.

## When the message is sent

At the chosen time, the message is sent **exactly as if you had typed it and pressed send yourself** — it goes through the very same send path as a normal message. In practice that means:

- If the session was idle, its process is **revived** to receive the message, just like sending by hand.
- The message shows up in the conversation as **your own** message.
- Everything downstream — streaming, permissions, tools — behaves identically to a normal send.

Delivery is routed to **one live tab** for that session, picked in this order:

1. The **tab you set the reservation from**, if it's still open.
2. Otherwise, a **tab currently showing that session**.
3. Otherwise, the **most-recently-focused** tab.

If no tab is open when the time arrives, the message is delivered **the next time you attach** to that session — nothing is lost.

## Managing your scheduled messages

Once a session has at least one reservation, a **clock button** appears in the top bar with a **count badge** showing how many are pending. Click it to open the **Scheduled messages** panel.

*The Scheduled messages panel: each row shows a live "in N …", the exact send time, and Edit / Cancel.*

![The Scheduled messages panel listing reservations with relative time, absolute time, and edit and cancel actions](./assets/panel.png)

Each row in the panel shows:

| Element | Details |
|---------|---------|
| **The message** | Clamped to 3 lines; **click it to expand** to the full text (click again to collapse). |
| **Live countdown** (top-right) | A relative "**in N min / sec / hours / days**" that **updates every second** while the panel is open. When the time is due it reads "**due now**". |
| **Exact send time** | The absolute time to the **second**, in 24-hour form (`YYYY-MM-DD HH:mm:ss`, local time). |
| **Edit** | Reopens the popover **pre-filled** with this reservation's message and time — change either and it saves as an update. |
| **Cancel** | Deletes the reservation. |

The list is sorted **soonest-first**, so the next message to go out is always at the top.

### Editing a reservation

Pressing **Edit** on a row reopens the same popover as a centered overlay, pre-filled with that reservation's message and its exact send time (it opens on the **Custom** date-and-time so you see the precise moment). Adjust the message, the time, or both, then press **Save**.

*The Edit overlay — the popover reopened, pre-filled from the reservation.*

![The Edit overlay showing the popover pre-filled with an existing reservation](./assets/edit-overlay.png)

## Keyboard shortcuts

The create/edit popover is fully keyboard-operable:

| Key | Action |
|-----|--------|
| **Tab** / **Shift + Tab** | Move between the message box, the When picker, and the Schedule button (focus stays inside the popover). |
| **Enter** / **Space** / **Arrows** | On the When dropdown: open it and move through the options. |
| **Cmd / Ctrl + Enter** | Submit (Schedule / Save) from anywhere in the popover. |
| **Esc** | Close the popover. |

A plain **Enter** inside the message box inserts a newline — the same behavior as the main composer — so you can write multi-line messages freely.

## Notes

- Reservations are **per session** — the clock button, the count badge, and the panel all reflect the session you're currently in.
- Relative times ("in N …") are always shown from *now*; the absolute time is the fixed moment the message will actually be sent.
