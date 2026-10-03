# Shortcuts help, Control-key text editing, and Undo in the prompt

> Language: **English** · [한국어](./ko.md)

The next release changes three things about the keyboard, and they
belong together because all three come from the same question: "which keys do
what in the chat input?"

1. A **Help modal** that lists the shortcuts that are true on your machine.
2. The **Control-key text editing keys** on macOS (Ctrl+A, Ctrl+B, Ctrl+F,
   Ctrl+K and the rest of the keys every Mac text field understands), which did
   nothing in the chat input before
   ([#506](https://github.com/Swttch/swttch/issues/506)).
3. **Undo and Redo that act on the prompt** instead of on the IDE
   ([#495](https://github.com/Swttch/swttch/issues/495)).

## The Help modal

Press **Cmd+/** on macOS, or **Ctrl+/** on Windows and Linux, and the Help modal
opens over the chat.

![The Help modal on macOS. A title "Help" with a close button, one tab named "Shortcuts", and the first group "GENERAL" with rows such as "Open or close this help" with the keys ⌘ /, "Open a new chat tab" with ⌘ N, "Open settings" with ⌘ ,, "Choose the model" with ⇧ ⌘ M, and "Zoom in" with ⌘ +. The next group "CHAT INPUT" begins at the bottom with "Send the message".](./assets/help-modal-shortcuts.png)

You can close it four ways:

- Press the same key again (Cmd+/ or Ctrl+/).
- Press **Esc**.
- Click the **X** at the top right of the modal.
- Click anywhere outside the modal.

It is also in the command palette as **Keyboard shortcuts**, next to the other
support entries. Choosing it from the palette only opens the modal. If the modal
is already open, choosing the entry again does not close it; only the keys, Esc,
the X, and a click outside close it.

When the modal opens, the keyboard focus moves into the modal itself rather than
into a field, so a stray keystroke does not type into your prompt. When it
closes, focus goes back to where it was.

### What is listed

The modal has one tab for now, **Shortcuts**. The list is divided into groups,
and every row is a plain sentence about what the key does, with the keys drawn
as key caps on the right. A row with two combinations (for example "Move back or
forward one character") shows both, separated by a slash.

| Group | What is in it |
| --- | --- |
| **General** | Open or close this help, open a new chat tab, open settings, choose the model, switch to the next model, clear the conversation, refresh the session list while it is open, zoom in, zoom out, reset the zoom. Inside a JetBrains IDE it also lists **Ctrl+Shift+C**, "Open Claude Code from the IDE". |
| **Chat input** | Send the message, start a new line, switch the permission mode (Shift+Tab), bring back an earlier or later prompt from the first or last line (the Up and Down arrows), start or stop voice input. Inside a JetBrains IDE it also lists **Alt+K**, "Send the editor's file and selected lines to the chat". |
| **Text editing** | Jump to the start or end of the line, jump to the start of the text, jump to the end of the text (all three on macOS only), and move back or forward one word. |
| **Edit with Control keys** | The fourteen Control-key text editing keys described below. Appears on macOS only. |

The list is not a fixed picture. It is built from your machine and your
settings, so a row is shown only when it is true for you:

- **Send and new-line rows show your own keys.** If you changed them in
  Settings (see
  [Choose what sends and what breaks the line](../070-composer_send_and_newline_keys/en.md)),
  the modal shows the keys you chose, not the defaults. Where a setting binds
  both Ctrl+Enter and Cmd+Enter, the modal names the one that belongs to your
  platform.
- **The voice input row follows voice input.** It is hidden when voice input is
  turned off or has no shortcut.
- **IDE-only rows (Alt+K and Ctrl+Shift+C) appear only inside a JetBrains IDE.**
  In a browser (standalone mode) those keys do not exist, so the rows are left
  out instead of describing a key that does nothing.
- **The Text editing group is shorter on Windows and Linux.** There it holds only
  the word move, because Home, End, and Ctrl+Arrow already do the rest in every
  text field.
- **"Jump to the start of the text" (Cmd+Up) is left out inside a JetBrains IDE.**
  The IDE takes Cmd+Up for its own navigation bar before the page can see it, so
  the modal does not promise it there.
- **The "Edit with Control keys" group appears only on macOS.**

### How keys are drawn

On macOS the modifier keys are the symbols printed on a Mac keyboard, in Apple's
own order: **⌃** Control, **⌥** Option, **⇧** Shift, **⌘** Command. On Windows
and Linux they are the words **Ctrl** and **Alt**. A few keys are symbols on
every platform: the arrows (**↑ ↓ ← →**), **⇧** for Shift, **⇥** for Tab, and
the enter arrow for Enter, which is **↩** on macOS (Return) and **↵** elsewhere.

## Control-key text editing on macOS

Every Mac text field understands a set of Control-key combinations that come
from macOS's own text key bindings. Ctrl+A goes to the start of the line, Ctrl+K
deletes to the end of it, Ctrl+Y brings back what was deleted. Many Mac users
type them without thinking, in Notes, in Safari, in Terminal.

In the chat input they did nothing. Under JetBrains IDEs the chat runs in an
embedded browser that never receives these macOS bindings, and in the IDE the
IDE itself also claimed several of the same keys (Ctrl+T, Ctrl+V and others were
bound to IDE actions). That is
[#506](https://github.com/Swttch/swttch/issues/506).

They now work, with the same meaning they have in any other Mac text field.

![The Help modal scrolled down to its last group. The group "EDIT WITH CONTROL KEYS" has the note "The same keys work in every Mac text field." and the rows "Jump to the start or end of the paragraph" (⌃ A / ⌃ E), "Move back or forward one character" (⌃ B / ⌃ F), "Move up or down one line" (⌃ P / ⌃ N), "Delete the character after or before the caret" (⌃ D / ⌃ H), "Delete to the end of the paragraph" (⌃ K), "Paste what Ctrl+K deleted" (⌃ Y), "Swap the two characters around the caret" (⌃ T), "Open a new line after the caret" (⌃ O), "Move down one screen" (⌃ V), and "Scroll to put the caret in the middle" (⌃ L). Above the group, the row "Move back or forward one word" shows ⌥ ← / ⌥ →.](./assets/help-modal-control-keys.png)

### The fourteen keys

| Keys | What they do |
| --- | --- |
| **Ctrl+A** / **Ctrl+E** | Jump to the start or the end of the paragraph. A paragraph here is the stretch of text between two line breaks. |
| **Ctrl+B** / **Ctrl+F** | Move back or forward one character. An emoji counts as one character. |
| **Ctrl+P** / **Ctrl+N** | Move up or down one line, keeping the column. In the chat input a line is a row as drawn on screen, so a long wrapped sentence counts as several. |
| **Ctrl+V** | Move down one screen: the caret goes down as many rows as the field shows at once (at least one), and the field scrolls only as far as needed to keep the caret in view. In a one-line field it goes to the end. |
| **Ctrl+D** | Delete the character after the caret. With text selected, delete the selection. |
| **Ctrl+H** | Delete the character before the caret. With text selected, delete the selection. |
| **Ctrl+K** | Delete from the caret to the end of the paragraph, and remember what was deleted (see below). With the caret already at the end of a paragraph it deletes the line break, which joins the next line on. With text selected it deletes exactly the selection. At the very end of the text nothing happens. |
| **Ctrl+Y** | Paste what Ctrl+K deleted, replacing any selection. Nothing happens if nothing has been deleted yet. |
| **Ctrl+T** | Swap the character before the caret with the one after it, and leave the caret after the pair. At the end of a paragraph it swaps the two characters before the caret instead, so pressing it repeatedly at the end of a line keeps fixing the last typo. Nothing happens with text selected, near the start of a paragraph where there are not two characters to swap, or when the pair would include a line break. |
| **Ctrl+O** | Open a new line after the caret: a line break is inserted and the caret stays in front of it, so the text after the caret drops down while you keep typing on the current line. Does nothing in a one-line field. |
| **Ctrl+L** | Scroll so the caret sits in the middle of the visible area. It changes no text. It does nothing when the field is not taller than its scroll area, and nothing in a one-line field. |

**Shift extends the selection.** Holding Shift with Ctrl+A, B, E, F, N, P or V
selects from where the caret was to where it lands instead of just moving, the
same as Shift with the arrow keys. These are the same seven keys that macOS
gives a selecting variant; macOS gives none to the other seven. So Shift with
Ctrl+D, H, K, L, O, T or Y does nothing.

**Every edit is undoable.** Text changed by these keys goes into the field's
normal undo history, so Cmd+Z takes it back (see
[Undo and Redo](#undo-and-redo-act-on-the-prompt) below).

### The kill ring: Ctrl+K stores, Ctrl+Y pastes

What Ctrl+K deletes is not lost. It goes into a small memory called the **kill
ring**, and Ctrl+Y pastes it back, at the caret or over a selection.

- **It is separate from the clipboard.** Ctrl+K never overwrites what you last
  copied with Cmd+C, and Ctrl+Y never pastes the clipboard.
- **It holds one piece of text.** The next Ctrl+K that starts a new deletion
  replaces it.
- **It is shared by every text field of the app.** Text you delete with Ctrl+K in
  the chat input can be pasted with Ctrl+Y into any other text box of the app. It lasts until the chat is closed or reloaded.
- **Consecutive Ctrl+K presses add up.** Press Ctrl+K three times at the start of
  a line: the first takes the line, the second takes its line break, the third
  takes the next line, and one Ctrl+Y brings all three back together. A Ctrl+K
  continues the one before it only when nothing happened in between: the caret is
  at the same place in the same field, the text is exactly as the previous kill
  left it, and no other Control-key text editing key was pressed. Typing,
  clicking elsewhere, or any other edit makes the next Ctrl+K start a fresh entry
  instead.

### Where they work

On macOS, in every text field of the app, not only the chat input: the prompt
and every other text box in the app. They work in
both environments the app runs in.

- **Inside a JetBrains IDE**, with any input source, including Korean. The IDE
  reads the key press and tells the chat which one it was, and the chat performs
  it.
- **In a browser (standalone mode)**, with a Latin keyboard layout, the browser
  performs them natively, exactly as it does in any other web page. With a
  non-Latin layout (Korean 2-set is the case that was reported) the browser does
  nothing by itself, so the app performs the key for you, reading which physical
  key you pressed. Where the browser would already have done it, the app stays
  out of the way so nothing is applied twice.

They do nothing while no text field has focus. They are ignored while an input
method is in the middle of composing text (for example a half-typed Hangul
syllable) in the browser.

### What they do not do, and what changes

- **macOS only.** On Windows and Linux Ctrl+A, Ctrl+B and the others mean what
  they always meant there (select all, bold, and so on), and nothing is changed.
- **A "line" in a plain text box is a hard line.** In the chat input, Ctrl+P and
  Ctrl+N move by rows as drawn on screen. In a plain multi-line text box (a
  `textarea`) the app cannot read where a long
  line wraps, so a "line" there is the stretch between two line breaks, and
  Ctrl+P and Ctrl+N move between those. The same goes for Ctrl+V's "screen", and
  Ctrl+L centres by hard lines, so it can land a little above the caret when
  the text above wraps.
- **In the IDE, the IDE's own actions on these keys no longer fire while the chat
  has focus.** IntelliJ's macOS keymap uses Ctrl+T for "Refactor This" and
  Ctrl+V for the VCS popup. While the Claude Code panel has focus those keystrokes belong to the chat, the same
  fourteen letters with or without Shift. This holds even when no text field is
  focused: the key is taken and ignored. Click into the editor or another IDE
  panel first, and the IDE's own keys work as before.
- **Ctrl+N no longer opens a new chat tab on macOS.** Opening a new chat tab on
  macOS is **Cmd+N**, which still works, in the IDE and in the browser. On
  Windows and Linux, **Ctrl+N** still opens a new chat tab, unchanged.

## Undo and Redo act on the prompt

[#495](https://github.com/Swttch/swttch/issues/495): in a JetBrains IDE, pressing
Cmd+Z (macOS) or Ctrl+Z (Windows, Linux) while typing in the prompt could undo
something else. The IDE has its own undo history, and when it held a change of
its own, such as a file you had just moved in the project view, the key went to
the IDE first and it offered to undo the file move. The prompt never saw the key.

Now, **while the chat input has focus, Undo undoes the last text change in the
field.**

| | macOS | Windows and Linux |
| --- | --- | --- |
| **Undo** | Cmd+Z | Ctrl+Z |
| **Redo** | Cmd+Shift+Z | Ctrl+Shift+Z, or Ctrl+Y |

Undo and Redo walk the same history the field keeps for your typing, so they also
reverse edits made by the Control-key text editing keys, and by autocomplete
inserting a mention or a command.

Things to know:

- **With no text field focused, the keys do nothing.** If the Claude Code panel
  has focus but the cursor is not in a text field (you clicked on the messages,
  say), Cmd+Z neither undoes in the chat nor in the IDE.
- **The IDE's own undo is not reachable with these keys while the chat has
  focus.** That is the point of the change, and also its cost. To undo a file
  move or an editor change, put the focus in the editor or another IDE panel
  first and press the keys there.
- **Ctrl+Y is Redo on Windows and Linux only.** On macOS Ctrl+Y is the "paste what
  Ctrl+K deleted" key above, and Cmd+Y is not Redo in the macOS keymap.
- **In a browser (standalone mode) nothing was changed.** The browser performs
  Undo and Redo natively there.
- **The Help modal does not list Undo and Redo.** They are the standard keys of
  every text field, not shortcuts of this app.

## Quick reference

| I want to | macOS | Windows, Linux |
| --- | --- | --- |
| See all shortcuts | Cmd+/ | Ctrl+/ |
| Close the shortcut list | Cmd+/, Esc, the X, or a click outside | Ctrl+/, Esc, the X, or a click outside |
| Open a new chat tab | Cmd+N | Ctrl+N |
| Undo in the prompt | Cmd+Z | Ctrl+Z |
| Redo in the prompt | Cmd+Shift+Z | Ctrl+Shift+Z, Ctrl+Y |
| Move and edit with Control keys | Ctrl+A B D E F H K L N O P T V Y (Shift extends the moves) | not available |

## Related

- [#506](https://github.com/Swttch/swttch/issues/506): Control-key text editing (Ctrl+B, Ctrl+F, Ctrl+N, Ctrl+P and the rest) on macOS
- [#495](https://github.com/Swttch/swttch/issues/495): Ctrl+Z in the prompt triggered the IDE's undo
- [Choose what sends and what breaks the line](../070-composer_send_and_newline_keys/en.md): the send and new-line keys the Help modal shows
