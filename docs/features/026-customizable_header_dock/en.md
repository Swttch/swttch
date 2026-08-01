# Pick which header icons stay out, and in what order

The icons on the right of the chat header are now collected into a single **more (⋮)** menu, and you can pull the ones you actually use back out into a "dock" beside it. You choose which ones with an **eye icon**, the way Notion lets you show and hide table properties.

## The problem

Every new feature added one more icon to the right of the header. Usage battery, scheduled messages, background tasks, remote tunnel, settings, new tab — six of them.

And the cost was not only on the right. The header splits its width between the session title on the left and those icons on the right, so each new icon **ate into the session title first.** Open the chat in a narrow spot, like an IDE tool window, and only a few characters of the title survived.

Most of those six also matter to different people in different amounts. Someone uses the remote tunnel daily; someone else never touches it. The icon took up the same room either way.

## What changed

**By default the right side holds just ⋮.** All six features live inside it, and running one from the menu does exactly what it did before.

Open ⋮ and all six items are already there in one list. There is no separate "edit mode" to step into first.

1. Click the **eye icon** on the right of a row to add or remove it from the dock
2. Grab the **drag handle** on the left (the two-line icon) and move it up or down to change the **order** — icons already in the dock follow this same order
3. Click anywhere else on the row — neither the handle nor the eye — and the feature runs immediately

Your arrangement is saved and comes back the next time you open the chat. It also stays the same across projects — the dock is a toolbar you reach for by muscle memory, so icons moving when you switch projects would defeat the purpose.

## The handle, the eye, and the row are three different gestures

Having a drag handle, a run-on-click row, and an eye toggle all on the same row could easily mean touching the wrong one by accident.

So the three occupy entirely separate spots. A drag only starts from the **handle** on the left; only the **eye icon** on the right changes what's docked; clicking anywhere in between **runs the item**. Which one you touched is always unambiguous.

## Docking something does not remove it from the menu

An item you place in the dock **stays listed** in the ⋮ menu. Once someone has learned to find a feature in this menu, rearranging the dock should not make it disappear from there. Wherever you click it — dock or menu — it does the same thing.

## The menu shows the real state, not just a label

Each row shows, on the right, the exact same information its dock icon would show — so you can see the current state before you ever pull it out into the dock.

- **Usage** — the same battery icon and remaining percentage the dock icon shows. If usage tracking isn't set up yet, "Setup" appears instead
- **Scheduled messages / Background tasks** — the icon still changes colour while active, and a count badge appears on the right. **The badge is hidden entirely at zero** — an empty badge wouldn't say anything the bare icon doesn't already
- **Remote tunnel** — the icon still turns green while the tunnel is up, and "Active" appears in green text on the right only while it is
- **Settings / New tab** — one-shot actions with nothing ongoing to report, so nothing extra appears

## Accounts are not part of the dock

Account switching was left out of this cleanup on purpose. It is not a single action but a list you pick a saved account from, which sets it apart from the other six. It keeps its own icon to the right of ⋮, exactly as before, and clicking it still opens the same dropdown.

## Where notifications will go

Notifications do not exist yet, but their place is settled: the bell sits **to the left of ⋮ and is always shown**, not as a dock item. The dock exists to let you hide things, and an alert you never asked for must not be hideable — the same reason the account icon stays outside it.

## Notes

- Dragging only starts **from the handle**. The rest of the row runs the feature on click, as it always did.
- Pressing `Esc` mid-drag cancels it and leaves the item where it was.
- When a new feature ships later, it is added to the bottom of the list, starting out NOT docked. An arrangement you saved earlier will never hide a feature you have not seen yet.
