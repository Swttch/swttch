# Session names set with /rename

> Language: **English** · [한국어](./ko.md)

A session you rename with `/rename` now keeps that name everywhere the chat shows a session, and typing `/rename ` offers the current title so you can edit it instead of retyping it ([#512](https://github.com/Swttch/swttch/issues/512)).

Three things changed:

1. The **session list and the header** show the name you gave the session, not the first prompt you sent.
2. The list **refreshes by itself** when the rename goes through, and a reloaded chat still shows what you typed and the reply you got.
3. After `/rename ` the box **previews the session's current title**, and **Tab** turns it into real text.

## The name shows up in the session list and the header

Run `/rename Release checklist` in a chat. From then on that session is called **Release checklist** in the session dropdown and in the header, instead of the first message you sent.

![The session dropdown in the English interface. Under "Today" the first row reads "Release checklist" with "1m" on the right. Under "Yesterday" and "Past week" the rows are named after the first prompt of each session, such as "Write two short paragraphs about sorting strategie".](./assets/session-list-renamed.png)

This works for names set in the CLI too. A session you renamed in a terminal with `/rename` shows that name here as well.

### Which name wins

A session can be renamed in two places: with `/rename`, and from the session dropdown. The one you set **last in this app** is the one you see.

- If you rename a session from the dropdown and later run `/rename` with a different name **in this chat**, the `/rename` name takes over.
- If you rename from the dropdown after a `/rename`, the dropdown name is shown.

## The list refreshes by itself

You do not need to press the refresh icon next to the search box. When the CLI answers **"Session renamed to: …"**, the list reloads and the new name appears in the header and the dropdown.

## A reloaded chat keeps the command and the reply

Reload the page or reopen the session and the chat still shows what happened:

- the command **with its argument**, as `/rename Release checklist` (it used to come back as a bare `/rename`), and
- the reply, **"Session renamed to: Release checklist"**.

![A reloaded chat. The header reads "Release checklist". The first message is the command "/rename Release checklist", and below it the reply "Session renamed to: Release checklist" with the time "(Saturday) 9:05 PM".](./assets/rename-reply-after-reload.png)

Other slash commands that print something without asking Claude, for example the cost summary, now keep their output after a reload as well.

## Preview the current title after "/rename "

Type `/rename` and a space. The current title of the session appears after the caret in a dim italic, followed by a short label.

![The chat box with "/rename " typed. After it the dim italic "Release checklist" and the label "(Tab to accept)". Above the box the slash command list shows the single entry "/rename".](./assets/rename-title-preview.png)

Press **Tab** and the preview becomes ordinary text you can edit.

![The chat box after Tab. It now holds "/rename Release checklist" in normal text, with no preview and no label.](./assets/rename-title-accepted.png)

- **It is only a preview.** Nothing is sent or copied until you accept it, so pressing Enter right after `/rename ` does not send the title.
- **Cmd+Z / Ctrl+Z takes the accepted title back** in one step.
- **It appears only while the box holds exactly `/rename ` with one space.** The moment you type a letter of your own, a second space, or anything else, the preview goes away.
- **It needs a session with a title.** In a new chat with no message yet there is nothing to preview.
- **It also works on a Korean keyboard layout.** `/ㄱㄷㅜㅁㅡㄷ ` is `/rename ` typed with the Korean layout still on, and it gets the same preview. See [Slash commands typed with the Korean layout still on](../079-korean_layout_command_search/en.md).
- **When the line is too narrow**, the label "(Tab to accept)" is left out as a whole rather than cut in half. Tab works either way.
- The label is translated into all 12 interface languages. The title itself is shown as it is.

## What this does not do

- A name you set from the dropdown is stored by this app, not by the CLI. If you rename a session from the dropdown and later rename it again in a terminal (a different CLI process from the one behind this chat), this app keeps showing the dropdown name until you run `/rename` in this chat or rename it from the dropdown again. A session you never renamed from the dropdown is not affected, and shows the terminal's name.
- Running `/rename` with the same name the session already had changes nothing you can see.
