# Pick which header icons stay out, and in what order

> Language: [한국어](./ko.md) · **English**
>
> Related: [#249](https://github.com/yhk1038/claude-code-gui-jetbrains/pull/249)

Icons had been piling up to the right of the session title: the usage battery, scheduled messages, background tasks, the remote tunnel, settings, and open-new-tab. Six of them.

This update collects all six into a single **overflow (⋮) menu**, and lets you pull back out only the ones you actually reach for.

## What was wrong

Every new feature added another icon. That alone was cluttered, but the real problem was somewhere else.

**The header splits one row between the session title on the left and the icons on the right.** So every icon added took width from the title. Open the plugin in a narrow tool window and the title is down to a few characters.

![A header crowded with six icons, the session title truncated mid-sentence](./assets/header-before.png)

*Every icon turned on, in a narrow window. Six of them line up on the right while the title on the left cuts off at "Explain in 8 numbered sentences why …".*

The six also **matter to different people in different amounts.** Someone uses the remote tunnel daily; someone else never touches it. The icon took the same space either way.

## One ⋮ by default

Configure nothing and the right side now holds **just the ⋮**. All six features live inside it, and clicking one there does exactly what its icon always did.

![A header with only the ⋮ left, showing more of the session title](./assets/header-after.png)

*Same width, same session. The space the icons gave up goes to the title.*

## Pull out what you watch

Some of these you do want in view. How much usage is left, how many background tasks are running — none of that helps if you have to open a menu to see it.

So the space left of ⋮ is a **dock**, and you choose what sits there.

![The ⋮ menu open, each row showing a handle, an icon, a name, its live state, and an eye toggle](./assets/overflow-menu.png)

*Opening ⋮ shows all six as one list right away — there is no separate "edit mode" to enter first. Here only Usage has its eye on, which is why the battery also appears up in the header.*

Each row handles three things.

1. The **eye icon** at the far right puts that item in the dock, or takes it back out
2. The **drag handle** at the left (six dots) reorders the list when you move it up or down — the other rows slide out of the way as you go, and docked icons follow this same order
3. Clicking **anywhere else on the row** runs the feature immediately

Your arrangement is saved and comes back next time. It also stays put across projects — the dock is a toolbar you navigate by muscle memory, and icons that move between projects work against that.

## Three gestures in one row, without collisions

When a single row can be dragged, clicked to run, and toggled, it is easy to trigger the wrong one.

So the three occupy **entirely separate spots**. Dragging only starts from the handle on the left, only the eye on the right changes what's docked, and clicking between them runs the item. Hovering the handle lifts its background slightly, so where to grab is visible too.

## Docking something doesn't remove it from the menu

An item you pull into the dock **stays in the ⋮ menu.** Once you have learned where to find a feature, changing your layout should not make it disappear from there. Docked or not, clicking it in either place does the same thing.

## The menu shows live state too

Each row carries the **same information** its docked icon would show, so you can see the current state before deciding to pull it out.

- **Usage** — the battery icon and the percentage left. If usage tracking isn't set up yet, a "Set up" hint appears instead
- **Scheduled messages / Background tasks** — the icon changes colour while active, with a count badge on the right. **At zero, no badge appears** — an empty badge says nothing the icon alone doesn't
- **Remote tunnel** — turns green only while it's up, with a green "Active" label on the right
- **Settings / Open new tab** — one-shot actions with nothing ongoing to report

## Accounts are not part of the dock

Account switching was left out of this cleanup on purpose. It is not a single action but a list you pick a saved account from, which sets it apart from the other six. It keeps its own icon to the right of ⋮, exactly as before, and clicking it still opens the same dropdown.

## Where notifications will go

Notifications do not exist yet, but their place is settled: the bell sits **to the left of ⋮ and is always shown**, not as a dock item. The dock exists to let you hide things, and an alert you never asked for must not be hideable — the same reason the account icon stays outside it.

## Notes

- Dragging only starts **from the handle**. The rest of the row runs the feature on click, as it always did.
- You can reorder without a mouse: focus a handle, press `Space` to pick the row up, `↑` `↓` to move it, and `Space` again to drop it.
- Pressing `Esc` mid-drag cancels it and leaves the item where it was. A cancelled reorder is never saved.
- When a new feature ships later, it is added to the bottom of the list, starting out NOT docked. An arrangement you saved earlier will never hide a feature you have not seen yet.
