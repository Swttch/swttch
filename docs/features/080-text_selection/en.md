# Selecting text in the chat, and the Linux selection buffer

> Language: **English** · [한국어](./ko.md)

Selecting text in the chat now works every time, and on Linux what you select in the chat can be pasted with a middle click, as in any other program. Both were broken before ([#513](https://github.com/Swttch/swttch/issues/513)).

## Double-click and drag selection no longer fail

The chat used to move the cursor back into the input box the moment you pressed the mouse button anywhere on the chat. A press that moves focus away from the text you are clicking cancels the word or range you were about to select. The result: once a selection existed, clicking elsewhere and then double-clicking a word, or dragging across text, often selected nothing.

Now the cursor goes back to the input box when you **release** the button, and only when this would not get in the way:

- the click was on empty space of the chat, not on a button, a link, a field, a menu or a dialog;
- nothing is selected at that moment;
- nothing else holds the focus.

Pressing, double-clicking and dragging therefore behave like in any web page, and a plain click on empty space still puts the cursor in the input box so you can keep typing.

![The chat input with the sentence "Why does the retry logic wait twice?" typed in. The word "retry" is highlighted in blue after a double-click.](./assets/text-selection-input.png)

## Coming back to the tab

When you switch to another tab or window and return, the cursor goes back into the input box once, at the moment the window gets the focus again. This follows the same idea as the "refetch on window focus" setting of TanStack Query: it reacts to the window gaining focus, and does not run when the focus did not change. Leaving the tab for a moment (the window briefly reports being hidden and visible again) does not make the cursor flash in and out of the input box.

## Linux: middle-click paste of what you selected

On Linux, every program fills a second clipboard, the **selection buffer** (PRIMARY), as soon as text is selected, and a middle click pastes it. From IDE 2026.2 the embedded browser runs in a separate process and no longer fills that buffer, so text selected in a chat message or in the input box could not be pasted with a middle click.

The chat now reports what you select to the IDE, and the IDE puts it into the selection buffer.

- It is updated when you finish selecting (button released), and when the selection changes by keyboard such as Shift+Home.
- Selecting nothing, or clicking to drop a selection, leaves the buffer as it was, so you can still paste what you selected before.
- Text in password fields is never sent.
- It works on X11 and on Wayland (the IDE's own Wayland toolkit, and the X11 toolkit through Xwayland).
- The selected text itself is never written to the logs; only its length is.

## What this does not do

- **JetBrains IDEs only.** In the standalone mode, the browser fills the buffer itself, so nothing is added there.
- **macOS and Windows have no selection buffer**, so nothing happens there. Copying with Cmd/Ctrl+C is unchanged.
- The selected text travels from the chat to the IDE on the local machine, over the same connection the plugin already uses.
