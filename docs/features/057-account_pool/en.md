# Account pools: a usage limit no longer ends the conversation

> Language: **English** · [한국어](./ko.md)

## What was missing

You could save several accounts, but hitting a limit was still the end of it.

When Claude stopped mid-answer you opened settings, switched to another account,
came back, and started the thread again. The context was all still there with no
way to hand it over. Two accounts, one of them idle, and a person had to notice
that every time and move across by hand.

## What it does

In **Settings → Account & Pool**, drag one account onto another and hold: the two
are grouped into a **pool**. When a limit is reached the next account in that pool
takes over and **the conversation carries on where it stopped.**

Once the switch is through, the answer resumes from the point it was cut off. No
new session, no retyping the question.

### Making one

Drag an account onto the **middle** of another and rest there for a second. A
preview of the pool the two would form opens up; drop it and the pool is made.
It is the macOS Finder gesture: hold a file over a folder and the folder opens.

Dragging to the **top or bottom** of a row reorders instead of grouping. The wait
is only on grouping, so a drag that is merely passing over a row never creates a
pool by accident.

### The order is the switch order

The top-to-bottom order inside a pool card is the order accounts take over in.
Whichever one is up after the account in use is marked **Next**.

Drag to change it. The arrangement is saved and survives a reopen.

### Taking one out, or letting the pool go

Drag an account **out of the pool card** and only that account leaves. While it is
outside, the row shows that dropping there will remove it. Take one out of a pool
of two and the remaining account stands alone, so the pool goes with it.

The **×** in the card's corner dissolves the pool and keeps the accounts. The
arrangement built inside the card is preserved.

## Worth knowing

**Not sponsor-only.** Waiting for a limit to reset and resuming automatically is a
sponsor feature; switching accounts is not.

**Independent of the "Auto-resume on usage limit" setting.** With that setting off,
a pool with somewhere to go still switches. The two are alternatives in the same
moment: switch if there is a next account, wait for the reset if there is not.

**The switch is confirmed before the conversation resumes.** Asking for the switch
is not taken as proof it happened. The account list is re-read to confirm the
target really is active, and a short request is put through on it, before anything
is resumed — so the conversation is never handed back to an account that is still
blocked.

**A pool that is entirely spent stops.** With every account at its limit it waits
up to 60 seconds, says so, and stops, rather than cycling through accounts.
