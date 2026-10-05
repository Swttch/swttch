# Line numbers on Edit cards, and a jump to the line

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#508](https://github.com/Swttch/swttch/issues/508), [Open files with](../014-open_files_with/en.md)

## What's new

When Claude changes a file with the Edit tool, the card in the chat shows the
change as red and green lines. Those lines now carry **line numbers** in a
column on the left, and **clicking a number opens that file at that line**.

Before, the card showed what changed but not where. To find the spot, you had
to open the file and search for the text yourself.

![An Edit card for greeting.ts. Each line has its number in a column on the left, from 12 to 18. The removed line, "return `Hello, ${trimmed}!`;", is red and numbered 16 with a minus sign. The added line, "return `Hello, ${trimmed} and the whole team!`;", is green and also numbered 16 with a plus sign.](./assets/edit-card-line-numbers.png)

## What you see

- **A number on every line of the diff.** The numbers start where the change
  starts in the file, so the lines around the change are numbered too.
- **Which file the numbers belong to.** A line that is still in the file shows its
  number in the edited file. A removed line shows the number it had in the file
  *before* the edit, which is why a removed line and the line that replaced it can
  share a number, as 16 does above.
- **The same numbers while Claude is working and after a reload.** The card shows
  them as soon as the Edit finishes, and they are the same when you reopen the
  session later.

## Jumping to the line

Click a number on a context line (grey) or an added line (green).

| Where you are | What happens |
|---|---|
| **A JetBrains IDE** | The file opens in the editor with the cursor on that line. |
| **A standalone browser** | The file opens in the editor you chose under **Settings → CLI → Open files with**, at that line, for the editors listed below. |

In a standalone browser, how the line reaches the editor depends on the editor:

| Editor | How the line is passed |
|---|---|
| Visual Studio Code, VS Code Insiders, VSCodium, Cursor, Windsurf | Through the editor's own link, such as `cursor://file/path:line` |
| JetBrains IDEs (WebStorm, IntelliJ IDEA, PyCharm, Android Studio and the rest) | Through the IDE's launcher with `--line` |
| Sublime Text, Zed | As `path:line` |
| **Configure Custom Editor…** | Write `%LINE%` and `%COLUMN%` in the **Arguments** field, for example `--line %LINE% %TARGET_PATH%` |

## What it does not do

- **A removed line does not jump anywhere.** The file no longer has that line, so
  there is nothing to open. Its number is shown for reference only.
- **Some editors open the file at the top.** Xcode, Emacs, Neovim, Fleet and
  **System default** have no way to take a line number from us, so the file opens
  but the cursor stays at the top.
- **A file that no longer exists does not open.** If the file was moved or deleted
  after the edit, as can happen with an old session, nothing opens.
- **Some old cards have no numbers.** The numbers come from the position the Edit
  result reports. If a saved session did not record it, the card still shows the
  change but leaves the numbers out, because guessing the position would send the
  click to the wrong line.
- **A very narrow chat hides the diff.** Below about 400 pixels wide the card
  shows only its header, as before.
