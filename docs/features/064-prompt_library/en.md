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
| **Global** | Files under `~/.claude-code-gui/entities/prompt/` | In every project |
| **Project** | The same files, on rows tagged with the project folder's path | Only in that project |

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

### Reordering

Prompt rows are reordered by dragging. There is no separate handle: **the whole
row is the handle**. Clicking a row pastes it into the input, as before, and the
drag only starts once the mouse has moved a few pixels. The pencil and the
trash can on a row are plain buttons and never start a drag.

![The Prompt Library with a prompt row being dragged. "Explain a file" is lifted
with a shadow, and "Release notes" and "Reproduce a re..." below it have slid
down one place to leave a gap. "PR review" at the top has not moved.](./assets/reorder-rows.png)

While you drag, the neighbouring rows slide aside and leave the place where the
row will land. `Esc` puts the original order back. The global list and the
project list move only within themselves; a row cannot be dragged from one list
into the other.

A new order is saved the moment you drop. It survives closing the library and
restarting the IDE, and the `!!` panel lists the prompts in the same order.

#### Which order changes

| You are looking at | Dragging changes |
|--------------------|------------------|
| **All** | The order of the whole library |
| **One category** | The order inside that category only. The overall order and every other category stay as they were |
| **Uncategorised** | Nothing. The unfiled rows have no order of their own. Dragging a row onto a category to file it still works |

The same prompt may sit in a different place in each category. When you pick a
category, a line above the lists reads "This order applies inside this category
only.", so you know the drag is not changing the overall order.

![The Prompt Library with the Docs category picked. Above the lists the line
"This order applies inside this category only." is shown, and Global Prompts
holds just "Release notes" and "Explain a file". In the category column "Docs" is
outlined in blue.](./assets/category-order.png)

You can drag while a search is active. Only the rows that survived the search
are there to drag, and the hidden rows keep their order relative to each other.
The row lands next to the visible row you dropped it beside.

#### Ordering categories

Rows in the category column are dragged by the whole row too. **All** is
sorted together with the categories. It starts at the top, but you can drag it
between categories or to the bottom, and the place you leave it is saved. Only
**Uncategorised** stays fixed at the bottom: it cannot be dragged, and nothing
can be dropped below it. A row whose name you are editing does not drag. A
category you create later always lands below **All**, at the end of the
categories, wherever you left **All**.

![The Prompt Library with a category being dragged. "Debug" is lifted and sits
just under "All", and "Review" and "Docs" have slid down one place.](./assets/reorder-categories.png)

A category row is also a place to drop prompts. Drop a prompt on it and the
prompt is filed there; drop a category on it and the categories swap places. The
two are never confused.

#### Moving with the keyboard

You can reorder without a mouse. With a row highlighted, **`Alt+↑`** and
**`Alt+↓`** move it one place and the highlight follows. When the focus is in the
category column, the same keys move the category. It works in the `!!` panel
too, and does nothing at the very top or bottom.

Where the IDE claims `Alt+↑↓` as one of its own shortcuts, the key may not reach
the row. Use the mouse there.

### Editing and deleting from the keyboard

While a row is highlighted you can edit and delete without the mouse. It works
the same in the library screen and in the `!!` panel.

| Highlighted | Key | What happens |
|-------------|-----|--------------|
| A prompt | **`e`** or **`→`** | Same as pressing its pencil button: that prompt's edit screen opens |
| A prompt | **`Backspace`** | Asks first whether to delete it. `Esc` on the question cancels |
| A category | **`e`** | The category's name turns into a text field in place. `Enter` saves, `Esc` puts the old name back |
| A category | **`Backspace`** | Asks first whether to delete it. Only the category goes; its prompts stay |

- `e` is recognised by the **position of the key**, not by the letter it types.
  The key that types `ㄷ` on a Korean keyboard works as `e` too. The edit screen
  or the name field opens when the key is **released**, not when it goes down:
  opening it on the press would type the key's character (`ㄷ`) into the field
  that just opened.
- While a category's name is being edited, `Enter` saves and `Esc` cancels
  (the old name comes back). `Esc` works even when the cursor is not in the
  field.
- **Categories are not edited with `→`.** In the category column `→` crosses into
  that category's prompts, and once there `→` opens the edit screen of the
  highlighted prompt.
- **All** and **Uncategorised** are not categories, so they cannot be edited or
  deleted.
- If you opened the edit screen from the `!!` panel, closing it (saving,
  cancelling or `Esc`) brings you back to that `!!` panel. An edit screen opened
  from inside the library returns to the library's list.
- The library screen and the `!!` panel start on the **top category of the
  column**, with the first prompt of that category highlighted. If you moved
  **All** down, they open on the first category.
- After a delete the library screen or the `!!` panel stays open, and only the
  deleted row disappears.
- In the library screen's search box, `e` and `Backspace` are ordinary
  characters. Press the up or down arrow and the cursor leaves the box for the
  list; from then on they are commands.
- The `!!` panel shares its place with the text you were typing, so `e` and
  `Backspace` become commands only **after you have moved a row with the up or
  down arrow**. Type anything again and they go back to being part of the search.

### `Esc` cancels only what you were doing

`Esc` closes the one thing on top. If the question about deleting is open, that
question closes; if a category name is being edited, that edit is cancelled; on
the edit screen it goes back to the list; on the list it closes the library. The
`!!` panel and the dialog that asks for `{{...}}` values behave the same.

**That holds while Claude is answering, too.** Before, closing one of these with
`Esc` during a response could let the same key reach the input as well, stopping
the tools and cutting the response off. Now the `Esc` that closes a window or a
panel ends there and does not stop the response. To stop a response, press `Esc`
when no window or panel is open.

### Writing a prompt

![The Edit Prompt screen. A Name field reading "Reproduce a report". A Category
box holding two blue chips, "Review" and "Debug", each with an X, and the text
"Onb" typed after them, with a menu below offering `Create "Onb"`. Under that a
Content box, and Cancel and Save at the bottom.](./assets/edit-prompt.png)

| Field | Limit |
|-------|-------|
| Name | 60 characters |
| Content | 100,000 characters |
| Categories per prompt | 20 |

The name exists to tell your prompts apart in a list. It is not sent to Claude
and it does not have to be tidy.

The category box takes as many as you want. Type to narrow the list, and if the
name you typed is not one you have yet, the menu offers to create it:

- **Enter** creates what you typed, with the caret still sitting after it.
- **Tab** walks down the menu the way the down arrow does, and **Shift+Tab**
  walks back up. Past either end, Tab goes back to leaving the field.
- **Backspace** on an empty box takes the last chip off. With text still in the
  box it deletes the text instead.

A name you already have is never offered for creation, whatever the casing, so
"Review" is found rather than made a second time as "review".

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

### Filing by dragging

Opening a prompt's form to file it is a lot of steps for a small decision, so
you can drag the row itself onto a category and the prompt is filed there.

![The Prompt Library mid-drag. The lifted "PR review" row floats over the
category column and its original place is empty. "All" is faded because it
would not take this prompt.](./assets/drag-to-category.png)

It works the same way in the `!!` panel. The prompt rows and the category chips
there are dragged to reorder too, in the very order the library screen shows.
The text in the input, and the `!!` itself, stay untouched while you drag.

While you drag, a category lights up only if dropping would actually change
something. The ones that would not stay faded, which is the screen telling you
in advance rather than accepting the drop and doing nothing.

| Dropped on | What happens |
|------------|--------------|
| A category | The prompt is **added** to it, keeping the categories it already had |
| **Uncategorised** | Every category comes off |
| **All** | Nothing. "All" is not a place to file anything |

Adding rather than replacing is deliberate: a prompt can carry several, so a
drag means "this one too", not "only this one". Dropping onto Uncategorised is
how you take them all off again without opening the form.

## Export and import

Each scope has its own **Export** and **Import**.

![The Export prompts dialog. Four prompts each with a ticked checkbox and a
one-line preview: "PR review", "Release notes", "Reproduce a report", "Explain a
file". At the bottom "4 selected", Cancel and Export.](./assets/export-dialog.png)

Export writes one JSON file. Everything is ticked to begin with; untick whatever
you do not want to hand over. The file is named for the moment you wrote it, as
`prompts-20260913010203.json`. The list is in the library's order, and the
categories your chosen prompts actually use travel with them, together with the
**order inside each category**.

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

Incoming prompts are put at the **top** of the library, in the order the file
lists them. The prompts you already have do not move. The same goes inside a
category: incoming prompts go on top of that category in the order the file
recorded for it. **Replace** swaps the name, the content and the categories and
leaves the place the prompt already had on this machine.

"Already there" means the prompt's id matches. A file exported before an update
still matches, because the ids carry over.

If the file carries categories, they are matched to yours **by name**. A prompt
arriving under "Review" joins the "Review" you already have rather than creating
a second one, and a category you have never heard of is created.

### Bringing prompts in from somewhere else

The importer is deliberately forgiving about what a prompt file looks like,
because the file you want to bring over was probably not written by us.

It accepts all of these:

- Our own export file, with its format stamp. Files exported by earlier versions read fine too; they just carry no order inside categories
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
- **Moving or renaming a project folder detaches its prompts.** Project prompts
  are stored against the folder's path, so the new path starts out like a
  project with none, and the old path shows them again if you go back. If you
  need them at the new path, export from the old one and import at the new one.
- **Another machine's order does not follow along by itself.** An export file
  carries the order, so importing puts the file's order at the top; that is all.
- **Categories are global.** There is one set of category names, shared by the
  global and the project halves of the library. This is deliberate: a category
  you can only use on one side of the screen would be worse than no category.
- **Deleting a category is not undoable**, though it never deletes a prompt.
- **`{{...}}` placeholders are ours, not Claude's.** They are filled in before
  the text reaches the input. Claude never sees a `{{`.

## Coming from an earlier version

Earlier versions kept prompts in `~/.claude-code-gui/prompts.json` (global) and
`<project>/.claude-code-gui/prompts.json` (project). This version moves those
files into the new store **once**, when the plugin starts for the first time
after the update. You do not have to do anything.

- The shared prompts and categories go first, the projects after.
- Names, contents and both times are not changed by a single character, and the
  order on every screen is the one it had just before. Earlier versions listed
  new prompts first, so they are still first after the move.
- The projects it looks in are the ones the plugin knows: every folder you have
  used Claude Code in, and every folder the plugin was asked about. Nothing walks
  through your home folder, so macOS does not ask for access to `Desktop`,
  `Documents` or `Downloads` out of nowhere.
- While the move runs, the library waits for it. If it takes more than a second a
  banner says your data is being updated. If it is quicker you see nothing.
- **The old files are neither deleted nor edited.** They stay as they were and
  serve as a backup.
- If the move fails, the library and the project list show an error instead of an
  empty list, a banner names the step that failed, and the next start tries again
  from that step.
- If some old files cannot be read (no permission, or the file is damaged), the
  rest is moved and a banner lists the folders. Those prompts stay in the old
  file; import it to bring them over.
- Once a move is done it is never repeated, so prompts you delete do not come
  back.
- Prompts of a folder that has never had a Claude Code session and that the
  plugin never opened are not found, because nothing knows that folder. They stay
  in the old file, and import brings them over.

If you go back to an earlier version, its files still read fine. Whatever you
changed while you were back there does not follow into the new store; to bring
it over, choose the old file in Import and merge it. Import reads the old
stored-file shape as it is.

## Where the files are

| What | Where |
|------|-------|
| Prompts (global and every project) | `~/.claude-code-gui/entities/prompt/prompt_items.entity.jsonl` |
| Categories | `~/.claude-code-gui/entities/prompt/prompt_categories.entity.jsonl` |
| Which category a prompt is in, and at what place | `~/.claude-code-gui/entities/prompt/prompt_category_item_links.entity.jsonl` |
| The project folders the plugin knows | `~/.claude-code-gui/entities/project/projects.entity.jsonl` |
| Id counters and the record of the move | `~/.claude-code-gui/entities/system/` |

All of them are plain text with one JSON object per line, and safe to read. A
project prompt is a row whose `projectId` is the number of a project in
`projects.entity.jsonl`, and that file holds the project folder's path.
`CCG_HOME` moves the whole location, if you have set it.
