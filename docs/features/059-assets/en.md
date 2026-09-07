# Every asset you attached, in one place

> Language: **English** · [한국어](./ko.md)

## What was awkward

Attaching screenshots to a conversation is ordinary work. Error screens, mockups, log captures pile up dozens deep in one session.

Seeing one of them again had exactly one path: **scroll the conversation back until the message it arrived with came into view.**

Enlarging an image was a dead end too. To see the one attached beside it you had to close the view, find the neighbouring thumbnail, and click again.

## What is new

### 1. Arrow keys move between assets

With one open, **←** and **→** step to the previous and next. **↑** and **↓** do the same: up for previous, down for next.

The arrows at the edges of the screen work too, and **Esc** closes the view.

**The arrows stay put when there is nowhere to go, greyed out rather than removed.** Taking them away made the control you had just learned vanish, and made the same viewer look different each time it opened.

### 1-1. The toolbar underneath

A toolbar sits below the enlarged asset.

| Button | What it does |
|---|---|
| Grid | Goes to this session's Assets screen |
| Zoom in · out | Makes it larger or smaller |
| Open in new tab | Opens it in a browser tab (shown in the browser only) |
| The number | Where you are, e.g. `2 / 5` |
| Copy | Puts it on the clipboard |
| Download | Saves it as a file |

The number is shown **even for a lone asset, as `1 / 1`.** It is the answer to "is there more?", and the toolbar should not change shape depending on how many there are.

**Zoom resets when you step to the next one**, so a magnification chosen for one picture never leaves the next one cropped.

Right-clicking the image still gives you **the menu your browser or IDE always gave you.** The toolbar does not replace that menu; it puts the same actions somewhere you can see them.

### 2. Attachments you have not sent yet move too

Images sitting in the composer, still unsent, step the same way.

They stay **among themselves** and never run on into ones you already sent.

They are not part of the conversation yet, so counting them together with sent ones would blur what you are about to send.

### 3. The Assets screen

Everything attached in this session, on one screen.

They are grouped by the message they arrived with, captioned by what you typed at the time. Oldest sits at the top and newest at the bottom, so it reads the same direction as the conversation, and it opens scrolled to the most recent.

Clicking a thumbnail enlarges it, and the arrow keys work there as well.

There are three ways in.

| Where | |
|---|---|
| The **Assets icon** in the header | Hidden at first (see below) |
| The **`⋮` menu** at the end of the header | Always there |
| The **grid button** under an enlarged asset | |

> **No icon is the normal state.** A newly shipped item is missing from your saved header layout, so it arrives hidden.
>
> **Pin to dock**, at the top right of the Assets screen, puts the icon in the header. The same spot offers **Unpin from dock** to undo it.

## What sponsorship opens

Sponsorship unlocks **stepping across the whole session**.

| | Before sponsoring | Sponsor |
|---|---|---|
| Open the Assets screen | Yes | Yes |
| See every asset in the session | Yes | Yes |
| How far the arrow keys reach | **The assets attached to that message** | **The whole session** |

Every asset is visible on the Assets screen either way. What is held back is not seeing them, but **keeping one enlarged and paging through the entire session from there.**

So before sponsoring, the enlarged view tells you **how many more the session holds**, because the counter below it only counts within that message. **Show all**, beside it, opens the Assets screen where all of them are.

Hovering a greyed-out arrow explains why it stopped, and offers the way past it from there.

Sponsorship lives in Settings › Sponsor.

## What gets collected

**Only images you attached yourself.**

Screenshots Claude read while working are left out. The Assets screen is laid out around the messages you sent, and images nobody sent would break that axis.

If you rewound or forked the conversation, only the ones on the **branch still in play** appear. Images on an abandoned branch are not in the conversation either.

> Images are all this holds today, but the screen and its buttons say **assets**. That way the name still fits if other kinds arrive later.

## What keeps it quick

A session heavy with images is tens of megabytes if opened all at once.

So the list arrives **without the image data, positions only.** The pictures themselves are fetched one at a time, as each is about to be shown.

Thumbnails on the Assets screen load as they scroll into view. Nothing downloads tens of megabytes before you have looked at a single image.
