# Prompt Library

> Language: **English** · [한국어](./ko.md)

## The phrase you keep retyping

Most people who use Claude Code every day end up with a handful of sentences
they type again and again. "Review the changes on this branch and say what you
actually verified." "Reproduce this issue exactly as the reporter wrote it."
"Write release notes, one line per user-visible change."

Until now there was nowhere to keep them. You either retyped the sentence, or
you kept it in a scratch file and pasted it in.

The Prompt Library is that place. You save a phrase once, and from then on you
type `!!` in the chat input and pick it.

Requested in [#430](https://github.com/Swttch/swttch/issues/430).

## Typing `!!` opens the library

Type `!!` anywhere in the chat input and the library opens above it.

![The prompt panel open above the chat input. On the left a category column
reads "All (6)", "Review (2)", "Docs (1)", "Debug (2)". On the right a list of
prompts: "Start the demo" and "Check the build" marked Project, then "PR
review", "Release notes", "Reproduce a report" and "Explain a file" marked
Global. The last row is "Create prompt".](./assets/quick-panel.png)

Keep typing after the `!!` to narrow the list. The text you type is matched
against three things at once:

| Matched against | So that |
|-----------------|---------|
| The prompt's name | `!!rev` finds "PR review" |
| The prompt's content | You find it by a phrase you remember, even if you forgot the name you gave it |
| The names of its categories | `!!debug` finds everything filed under Debug |

Pick a row with the mouse, or walk the list with the arrow keys and press
`Enter`. `Escape` closes the panel and leaves what you typed alone.

**Picking a prompt pastes it. It does not send it.** That is the whole point:
you saved the phrase so you would not have to type it again, and you still want
to read it over, add today's detail and then send. The pasted text lands in your
input as ordinary text, and `Ctrl/Cmd+Z` undoes the paste like any other edit.

### Global and project prompts

Every prompt lives in one of two places.

| Scope | Stored in | Shown |
|-------|-----------|-------|
| **Global** | `~/.claude-code-gui/prompts.json` | In every project |
| **Project** | `.claude-code-gui/prompts.json` inside the project | Only in that project |

Project prompts are listed first, because when both match what you typed, the
project-specific phrase is the more specific answer.

Each row says which scope it came from, on the right.

If you have no project open, the project half is simply not there. Global
prompts still work.

## The library screen

The panel is for picking. The library screen is for keeping.

Open it from the `/` menu → **Context** → **Prompt Library**, or from the
**Create prompt** row at the bottom of the `!!` panel.

![The Prompt Library dialog. A search box across the top, a category column on
the left reading "All (6)", "Review (2)", "Docs (1)", "Debug (2)",
"Uncategorised (2)" and "+ Add category". On the right, a "Global Prompts"
heading with Export, Import and Add buttons and four prompt rows, then a
"Project Prompts - ccg-demo" heading with its own Export, Import and Add
buttons and two rows.](./assets/library-modal.png)

Each scope gets its own heading and its own three buttons, so there is never a
question of which half of the library a button is about to act on.

Each row carries the prompt's name, the first 80 characters of its text, and a
pencil and a bin. Hovering the preview shows the whole prompt, line breaks
included, because one truncated line cannot tell you what you are about to
paste.

The two lists scroll independently. A hundred global prompts will not push the
project ones off the bottom of the screen.

### Writing a prompt

![The Edit Prompt screen. A Name field reading "Reproduce a report", a Category
row with three chips - "Review" and "Debug" filled in blue, "Docs" not - and a
Content box reading "Reproduce issue #{{number}} exactly as the reporter wrote
it, on {{platform}}. Do not paraphrase their steps." Cancel and Save at the
bottom.](./assets/edit-prompt.png)

| Field | Limit |
|-------|-------|
| Name | 60 characters |
| Content | 100,000 characters |
| Categories per prompt | 20 |

The name exists to tell your prompts apart in a list. It is not sent to Claude
and it does not have to be tidy.

## Places to fill in

If your prompt contains `{{something}}`, we ask you for that value when you
insert it.

![The Fill in the values dialog. Two fields labelled "number" and "platform",
filled with "430" and "Windows 11". Below them a Preview panel reading
"Reproduce issue #430 exactly as the reporter wrote it, on Windows 11. Do not
paraphrase their steps." Cancel and Insert at the bottom.](./assets/fill-variables.png)

- Each distinct `{{name}}` becomes one field, in the order it first appears.
- The preview updates as you type, so you see the finished sentence before it
  goes anywhere.
- `Enter` moves to the next field that still needs a value, and once they are
  all filled it lands on **Insert**. `Shift+Tab` from Insert reaches Cancel.
- Leaving a field empty is allowed. The placeholder is simply replaced with
  nothing.
- **Cancel leaves your `!!` untouched**, so you can pick a different prompt.

A prompt with no `{{...}}` in it never shows this dialog. It pastes straight
away, exactly as it did before this existed.

### What counts as a placeholder

`{{name}}`, where the name contains no brace and is not empty. Everything else
is ordinary text:

- A stray `{{` with no closing braces stays exactly as you wrote it.
- A single `{brace}` is left alone, so JSON and template code inside a prompt
  survive unharmed.
- `{{   }}` with nothing but spaces in it is not a placeholder.

Names are trimmed, so `{{ focus }}` and `{{focus}}` are the same thing and are
asked for once. The same name used twice gets one field, and both places get the
answer.

A value that itself contains `{{...}}` is inserted as plain text. It is not
filled in a second time.

## Categories

Categories are tags, not folders. One prompt can carry several, and picking a
category in the column narrows both scopes at once.

- **All** is where the screen opens, and what you come back to.
- **Uncategorised** appears at the bottom, and only when something is actually
  filed under nothing.
- The number beside each name counts the whole library, not the part your search
  left, so the count does not move while you type.

Rename a category by hovering it and clicking the pencil, exactly as you rename
a session. **Renaming is one write.** Every prompt filed under it follows,
because prompts store the category's id, not its name.

Deleting a category removes only the category. The prompts that were filed
under it stay exactly where they are and become uncategorised. **You cannot lose
a prompt by tidying up your groups.**

The arrow keys work across both columns: `←` and `→` cross between them, `↑` and
`↓` walk whichever one you crossed into. The column you are walking is the one
with a ring around its selected row.

### On a narrow window

When the window is too narrow for two columns, the category column becomes a
strip of chips above the list. Nothing is hidden; it is the same list, laid out
sideways.

![The prompt panel in a narrow window. The categories are a single horizontal
row of chips reading "All (6)", "Review (2)", "Docs (1)", "Debug (2)" above the
prompt list, rather than a column beside it.](./assets/quick-panel-narrow.png)

This matches how the workflow agent list behaves at the same width.

## Export and import

Each scope has its own **Export** and **Import**.

![The Export prompts dialog. Four prompts each with a ticked checkbox and a
one-line preview: "PR review", "Release notes", "Reproduce a report", "Explain a
file". At the bottom "4 selected", Cancel and Export.](./assets/export-dialog.png)

Export writes one JSON file. Everything is ticked to begin with; untick whatever
you do not want to hand over. The file is named for the moment you wrote it, as
`prompts-20260913010203.json`, and the categories your chosen prompts actually
use travel with them.

In the JetBrains IDE you get the IDE's own save dialog. Outside it you get your
operating system's, which is the same dialog either way for you.

### Importing

Import asks for a file, tells you what is in it, and only then writes anything.

![The Import prompts dialog. It reads "2 new, 1 already in your library." Three
ticked rows follow: "Daily standup" marked New, "Write a handoff" marked New,
and "PR review" marked Already there. Below them, "When a prompt is already in
your library" with a three-way control set to "Keep mine" beside "Replace" and
"Keep both", and the line "The prompt you already have stays as it is." At the
bottom, "3 selected", Cancel and Import.](./assets/import-preview.png)

For each incoming prompt you see whether it is **New** or **Already there**, and
you can untick any of them. Then you choose what to do about the ones you
already have:

| Choice | What happens |
|--------|--------------|
| **Keep mine** | Your version stays. The incoming one is skipped |
| **Replace** | The incoming version replaces yours |
| **Keep both** | Both are kept, and the incoming one gets a new id |

New prompts are added under every choice. The three only decide what happens on
a collision.

If the file carries categories, they are matched to yours **by name**. A prompt
arriving under "Review" joins the "Review" you already have rather than creating
a second one, and a category you have never heard of is created.

### Bringing prompts in from somewhere else

The importer is deliberately forgiving about what a prompt file looks like,
because the file you want to bring over was probably not written by us.

It accepts all of these:

- Our own export file, with its format stamp
- Our on-disk store, which has no stamp
- A file that keys its prompts by id in an object, rather than listing them in
  an array
- A bare JSON array of prompts

A prompt needs a name and some content. Everything else we can work out.

Missing timestamps are filled in. An id we would never have written is replaced
with one we would, keeping the prompt itself. **One unusable row does not cost
you the good ones** — the readable prompts come in and the rest are dropped.

If the file is not JSON at all, or is JSON but not a prompt file, or turns out
to have nothing readable in it, we say which of those three it was rather than
failing silently.

## What this does not do

- **There is no way to move a prompt between scopes.** A global prompt cannot be
  made into a project one without retyping it. Say so on the issue tracker if
  you need it.
- **Prompts are not shared between machines.** They are files on your disk;
  export and import are how they travel.
- **Categories are global.** There is one set of category names, shared by the
  global and the project halves of the library. This is deliberate: a category
  you can only use on one side of the screen would be worse than no category.
- **Deleting a category is not undoable**, though it never deletes a prompt.
- **`{{...}}` placeholders are ours, not Claude's.** They are filled in before
  the text reaches the input. Claude never sees a `{{`.

## Where the files are

| What | Where |
|------|-------|
| Global prompts and every category | `~/.claude-code-gui/prompts.json` |
| Project prompts | `<project>/.claude-code-gui/prompts.json` |

Both are plain JSON and safe to read. `CCG_HOME` moves the first one, if you
have set it.
