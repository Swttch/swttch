# "Stop asking me for every edit" now works

> Language: **English** · [한국어](./ko.md)

## What went wrong

A user planned a change with Claude, approved the plan with **"Yes, and auto-accept"**, and then had to sit through an approval prompt for every single edit that followed.

> Now it is asking for every single edit with "Apply / Reject" - and there are a LOT of them. So I need to babysit all the while and press "apply" [...] So I have to "sit-through" hundreds of edits for this session although I know they're all necessary and need to be approved anyways.

Switching the composer to **Auto mode** did nothing. Switching it to **Edit automatically** did nothing either. The label at the bottom of the chat changed, and the prompts kept coming.

Looking for a way out in the IDE's diff review, they found a third button called **"Clear all"** and did not press it, because they could not tell what it did.

They were right not to. "Clear all" unticks every change in the file, which is the opposite of what they wanted.

The report is [#393](https://github.com/Swttch/swttch/issues/393), and it ends with the alternative they considered: *"Use CLI version."*

## Why it happened

Four separate defects added up to one experience. Every escape route the UI offered was inert.

**The mode never reached the running CLI.** `--permission-mode` is a flag the CLI reads when it starts, so a mode picked mid-conversation was carried only by restarting the process on the next message. While Claude was working, nothing the user pressed changed anything.

**Plan approval's "auto-accept" only set a label.** Choosing it flipped the composer to *Edit automatically* on screen and sent the CLI a plain approval with no mention of the mode.

**"Yes, allow all edits this session" was never told to the CLI.** It remembered a tool name in the webview and quietly answered later prompts on the user's behalf. The CLI went on asking every time — the question was being hidden, not answered. The memory was lost on a reload, and it covered only the one tool name that happened to ask, while Claude edits files through `Edit`, `Write`, `MultiEdit` and `NotebookEdit`.

**Neither diff review offered the escape at all.** The IDE's review bar had `Apply`, `Reject` and `Clear all`; the built-in review had `Confirm` and `Cancel`. Someone reviewing a diff had to know that the real answer lived in the chat prompt behind it.

## What changed

**A mode you pick now reaches the CLI that is already running.** Picking a mode — from the menu, by cycling, or by approving a plan with auto-accept — tells the live CLI to switch, so it takes effect for the rest of the turn instead of the next one.

The official path is still there and still first: if the running CLI does not take the switch, the next message restarts it under the new flag exactly as before.

**"Yes, allow all edits this session" is now said to the CLI.** The CLI stops asking on its own rather than the GUI hiding the question, so it survives a reload, and answering it on one edit tool covers the whole edit family. Answering it on `Bash` still covers only `Bash` — "allow all commands" is a much larger thing to hand over than "allow all edits", and it does not quietly widen.

**Both diff reviews now carry the escape.**

| Where | Button |
|---|---|
| IDE diff review | `Allow all edits`, on the left, apart from the buttons that answer this one diff |
| Built-in diff review | `Allow all edits`, next to `Confirm` |

Pressing it applies the change exactly as `Apply` / `Confirm` does — with whatever you have ticked — and stops the edits after it being asked about.

## What still asks

Commands. `Bash` is unaffected by all of this, and a command still needs your approval unless you allow commands specifically.

## Known limitation

While an approval prompt is on screen, the composer is not, so the mode selector is not reachable at that moment. The `Allow all edits` button is the way out from there.
