# Pick which header icons stay out, and in what order

The icons on the right of the chat header are now collected into a single **more (⋮)** menu, and you can pull the ones you actually use back out into a "dock" beside it. You arrange them by **dragging**, the way Notion lets you show and hide table properties.

## The problem

Every new feature added one more icon to the right of the header. Usage battery, scheduled messages, background tasks, remote tunnel, settings, new tab, account — seven of them.

And the cost was not only on the right. The header splits its width between the session title on the left and those icons on the right, so each new icon **ate into the session title first.** Open the chat in a narrow spot, like an IDE tool window, and only a few characters of the title survived.

Most of those seven also matter to different people in different amounts. Someone uses the remote tunnel daily; someone else never touches it. The icon took up the same room either way.

## What changed

**By default the right side holds just ⋮.** All seven features live inside it, and running one from the menu does exactly what it did before.

The ones you reach for often can be pulled out:

1. Open ⋮ and choose **Edit dock** at the bottom
2. The list splits into **In the dock** and **Hidden from the dock**
3. Drag an item into the top section and its icon appears to the left of ⋮
4. Drag within a section to change the **order**
5. Press **Done** to finish

Your arrangement is saved and comes back the next time you open the chat. It also stays the same across projects — the dock is a toolbar you reach for by muscle memory, so icons moving when you switch projects would defeat the purpose.

## Docking something does not remove it from the menu

An item you place in the dock **stays listed** in the ⋮ menu. It just gains a small dot on the right, meaning "this one is also out in the dock right now".

Once someone has learned to find a feature in this menu, rearranging the dock should not make it disappear from there. Wherever you click it — dock or menu — it does the same thing.

## Icons that carry state are more useful outside

A few of these are meant to be **watched rather than clicked**:

- Usage battery — how much is left, its colour, and a pulse below 20%
- Scheduled messages — how many are queued
- Background tasks — how many are running

Dock those and the value stays in view. Conversely, when there is nothing to report — no reservations, not signed in, no usage data yet — the icon **hides itself** from the dock instead of sitting there empty.

In the editor those items are always listed, even when their feature currently shows nothing. You should be able to decide "put this where I'll see it once it happens" before it happens.

## Accounts open inline

The account item behaves differently from the rest. It is not an action you trigger; it is a list you pick from.

So inside the ⋮ menu the **account list is laid out directly**. No extra submenu to open: names and email addresses are right there, with a check on the one you are signed in as, and Add account / Manage accounts in the same place.

## Notes

- Dragging only works **while editing the dock**. In the normal menu a click runs the feature — that keeps you from rearranging things by accident while trying to use them.
- Pressing `Esc` mid-drag cancels it and leaves the item where it was.
- When a new feature ships later, it is added to the bottom of **Hidden from the dock** automatically. An arrangement you saved earlier will never hide a feature you have not seen yet.

([#249](https://github.com/yhk1038/claude-code-gui-jetbrains/pull/249))
