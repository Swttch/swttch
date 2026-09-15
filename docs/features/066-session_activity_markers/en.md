# See at a glance which session is working

> Language: **English** · [한국어](./ko.md)

## With several tabs open, there was no way to tell which one was still running

Many people keep one chat tab per task and move on to something else while they
run. Those tabs said nothing at all while they worked.

The unread dot only appeared once a response had finished. Until then the icon
looked exactly like every other tab, so finding the one that was still working
meant opening them one at a time.

The CLI in a terminal already did this: while it works, its tab title carries a
spinning prefix. One reporter kept the native CLI open in a terminal **purely to
watch that spinner** ([#449](https://github.com/Swttch/swttch/issues/449)).

That is no longer necessary.

## The chat tab turns while it works

While a response streams, the chat tab's icon becomes a turning orange arc. It
stops when the response ends.

- It turns on an **editor tab**.
- It turns on a **side panel** tab.
- In a **browser**, the tab's favicon turns.

**Selecting the tab does not stop it.** Opening a tab does not stop its session,
and a tab that went blank the moment you looked at it would be blank exactly
while it was still working. It stops when the response actually ends.

It keeps turning while you are away on another tab, which is the situation this
exists for.

### When it finishes, it becomes the unread dot

If a response ends while you were not looking at that tab, the turning stops and
the **unread dot** appears — the behaviour that was already there. Returning to
the tab clears it.

## The session list shows every session's state

The tab marker only covers tabs you have open. To see the sessions you have not
opened as well, look at the session list.

It appears the same way in both the **session dropdown** (opened from the title
in the top bar) and the **session list side panel**.

A dot sits before each session title, and its colour is the state.

| Colour | Meaning |
|--------|---------|
| **Blue, turning** | Working right now |
| **Yellow** | Waiting for your answer: a permission, a plan approval, or a question |
| **Green** | Finished, and you have not looked since |
| **Grey** | Open, but nothing is happening |
| **No dot** | The tab is closed |

Hovering a dot **names the state in words**, so the colours do not have to be
learned.

### A row with no dot is a session whose tab is closed

Most sessions in the list are past conversations you do not currently have open.
Those are neither running nor waiting for anything. **They have no state to
report, so no dot is drawn.**

The dot's width goes with it. Leaving a blank in its place indents every closed
row against nothing, and closed rows are most of the list.

### When does the green dot clear?

**It is the unread dot's own rule.** Looking at the session clears it: in a
browser, when the tab becomes visible; in the IDE, when that editor tab becomes
the selected one.

The two deliberately share one rule. If the tab's unread dot and the list's
green dot said different things, there would be no telling which to believe.

**A session that is still working is not silenced by a glance.** Only a finished
response is marked read.

## The filter bar under the search box

A bar now sits between the session list's search box and its rows.

### `⚡ Active · N`

Press it and only the sessions that are **not finished with you** remain:
working, waiting for an answer, or finished but unread.

The number beside it is the sum of those three, and it is **exactly how many
rows survive the press**.

### The funnel button

Press it for the counts and the filters together.

**Status** holds waiting, working and completed; **Tabs** holds open and closed.
Pressing a row narrows the list to it and ticks it.

- **Picking several rows gives their union.** Working plus completed shows both.
- **Picking across the two groups gives their intersection.** Working plus open
  means "open and working".
- **Picking nothing means showing everything.** Turning the last one off brings
  the whole list back.

The menu **stays open while you pick**, because picking several is one action.

### The counts describe the rows the list is holding

Sessions filtered out by a search, or not yet loaded by scrolling, are not
counted. A number nothing on screen adds up to would be worse than no number.

## What it does not do

**The state of a closed session is unknown.** Closing a tab takes its marker
with it. That does not mean the session keeps running in the background; it
means nothing is watching it any more.

**Restarting the IDE or the browser clears the green dots.** The state lives in
memory and is not written to disk. An unread marker says "this just finished, go
and look", which is not something worth carrying across a restart.

**The favicon turns more coarsely than the IDE tab does.** Chrome repaints a
favicon only about 3.5 times a second, and asking it to repaint more often does
not raise that ceiling, so the frame count was chosen to match it. The IDE tab
has no such limit and turns more finely.

**Sessions on another machine are not shown.** Only what this backend knows
about is covered.

## Related

- Issue: [#449](https://github.com/Swttch/swttch/issues/449)
- PR: [#451](https://github.com/Swttch/swttch/pull/451)
