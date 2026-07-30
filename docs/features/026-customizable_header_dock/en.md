# Pick which header icons stay out, and in what order

The icons on the right of the chat header are now collected into a single **more (⋮)** menu, and you can pull the ones you actually use back out into a "dock" beside it. You arrange them by **dragging**, the way Notion lets you show and hide table properties.

## The problem

Every new feature added one more icon to the right of the header. Usage battery, scheduled messages, background tasks, remote tunnel, settings, new tab — six of them.

And the cost was not only on the right. The header splits its width between the session title on the left and those icons on the right, so each new icon **ate into the session title first.** Open the chat in a narrow spot, like an IDE tool window, and only a few characters of the title survived.

Most of those six also matter to different people in different amounts. Someone uses the remote tunnel daily; someone else never touches it. The icon took up the same room either way.

## What changed

**By default the right side holds just ⋮.** All six features live inside it, and running one from the menu does exactly what it did before.

Open ⋮ and the list is already split into **In the dock** and **Hidden from the dock** — there is no separate "edit mode" to step into first.

1. Grab the **drag handle** on the left of a row (the two-line icon) and drag it into the top section; its icon appears to the left of ⋮
2. Drag within a section to change the **order**
3. Click anywhere on the row OTHER than the handle and the feature runs immediately

Your arrangement is saved and comes back the next time you open the chat. It also stays the same across projects — the dock is a toolbar you reach for by muscle memory, so icons moving when you switch projects would defeat the purpose.

## The handle and the row are two different gestures

Having both "drag to rearrange" and "click to run" on the same row could easily mean accidentally running something while trying to move it, or accidentally moving something while trying to run it.

So the two are kept apart on purpose. A drag only starts from the **handle**; clicking anywhere else on the row **runs it**. Which one you touched is always unambiguous.

## Docking something does not remove it from the menu

An item you place in the dock **stays listed** in the ⋮ menu. Once someone has learned to find a feature in this menu, rearranging the dock should not make it disappear from there. Wherever you click it — dock or menu — it does the same thing.

## Icons that carry state are more useful outside

A few of these are meant to be **watched rather than clicked**:

- Usage battery — how much is left, its colour, and a pulse below 20%
- Scheduled messages — how many are queued
- Background tasks — how many are running

Dock those and the value stays in view. Conversely, when there is nothing to report — no reservations, no usage data yet — the icon **hides itself** from the dock instead of sitting there empty.

In the menu list those items are always shown, even when their feature currently has nothing to report. You should be able to decide "put this where I'll see it once it happens" before it happens.

## Accounts are not part of the dock

Account switching was left out of this cleanup on purpose. It is not a single action but a list you pick a saved account from, which sets it apart from the other six. It keeps its own icon to the right of ⋮, exactly as before, and clicking it still opens the same dropdown.

## Notes

- Dragging only starts **from the handle**. The rest of the row runs the feature on click, as it always did.
- Pressing `Esc` mid-drag cancels it and leaves the item where it was.
- When a new feature ships later, it is added to the bottom of **Hidden from the dock** automatically. An arrangement you saved earlier will never hide a feature you have not seen yet.
