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
are grouped into a **pool**. When a limit is reached the next account in that pool with confirmed available usage
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

The top-to-bottom order inside a pool card is the order eligible accounts take over in.
Accounts whose usage is exhausted are skipped before switching.
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

## Choosing an account before switching

When a streamed answer reaches a limit, the plugin first asks the external usage
battery (`ccb`) for each saved pool member's usage. It does this **without activating
each account in turn**. The next account in pool order with confirmed available
usage is selected. A stale reading for the account that just hit the limit cannot
send the conversation straight back to that same account.

Usage reports can lag behind Claude. After a switch, the existing chat sends a
continuation instruction to Claude. If Claude still rejects it, that account's
actual limit notice appears in the conversation and the normal auto-resume flow
handles it. A successful usage lookup is not a guarantee that Claude will accept
the next request.

## When every account is exhausted

The plugin chooses the account that can become usable soonest. For example, if
one account resets in four hours and another in one hour, it selects the latter.
It considers the five-hour limit, the weekly limit, and the applicable model's
weekly limit: if more than one blocks an account, that account must wait for the
last of those resets. Pool order breaks a tie.

If the selected account differs from the current account, the plugin switches
once and obtains its limit notice in the **same chat session**. With auto-resume
enabled for that session and sponsor access, the existing reservation mechanism
then schedules the continuation. If auto-resume is off, use **Schedule resume**
on the notice to reserve it manually; sponsor access still applies.

![The CLI limit notice followed by the existing “Auto-resume scheduled” state](./assets/limit-banner.png)

The reset time stays in Claude's limit sentence. **Auto-resume scheduled** confirms
that a reservation exists; it is not a separate timer or a second scheduling
system. You can also find the same reservation in the **Scheduled Messages** side
panel. See [Auto-resume on usage-limit reset](../019-auto_resume_on_limit/en.md)
for the countdown, recharge checks, and cancellation controls.

The reservation retains the selected account. At delivery time, usage is checked
for that account, and the continuation uses it even if a different account is
currently active. Reloading the chat while a recovery is pending does not create
a second continuation or discard an existing reservation. A manual account switch
or stopping the session cancels an account selection still in progress.

## Slow, failed, or unavailable usage checks

A lookup can fail because of an expired login, a network error, or a missing or
older battery CLI. A failed or incomplete result is **unknown**, not “unused” and
not “exhausted.” If another account has confirmed available usage, it can still be
selected. If none is confirmed available and any reading is unknown, the plugin
keeps the current account and falls back to its limit notice and auto-resume
controls. It does not claim to know which account resets first.

Saved-account queries require the battery CLI capability shipped with
`@swttch/extend-kit` **0.5.0**. An older CLI is detected before querying, so its
current-account response cannot be mistaken for another account's usage. The
capability check has a five-second timeout and each usage query a fifteen-second
timeout. Queries run together, so a larger pool does not multiply the wait by
fifteen seconds per member.

If your login has expired, sign in again using the normal account controls. If the
companion is outdated, update it using the existing dependency controls; installed
copies also receive a [startup update check](../005-cli_version_update/en.md#installed-dependencies-update-at-startup).
The plugin does not treat a failed lookup as permission to send a message anyway.
