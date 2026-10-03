# Slash commands typed with the Korean layout still on

> Language: **English** · [한국어](./ko.md)

If you start a slash command while the keyboard is still on the Korean layout, the command list now finds it anyway. `/rename` typed that way comes out as `/ㄱㄷㅜㅁㅡㄷ`, and you no longer have to switch the layout and type it again.

## What it does

Every Korean letter sits on a key that also types a Latin letter: ㄱ is the **R** key, ㄷ is **E**, ㅜ is **N**, and so on. The command list turns what you typed back into those keys and searches for that too.

Type `/ㄱㄷ` and the list shows what `/re` would show: `/recap`, `/reload-plugins`, `/reload-skills`, `/rename`. The letters it matched are bold.

![The chat box with "/ㄱㄷ" typed. Above it the command list shows "Resume conversation" and "Schedule a message..." under "Context", "Toggle auto-resume on limit" under "Model", and "/recap", "/reload-plugins", "/reload-skills", "/rename" under "Slash Commands", with the letters "re" in bold in each name.](./assets/korean-layout-search.png)

It works whether the letters are still separate or have already been joined into syllables by the input method. `/ㄱㄷㅜㅁㅡㄷ` and `/ㄱ두믇` both find `/rename`.

## Running a command typed that way

Pick the command, or press Enter, with the name still in Korean letters and the arguments after it:

`/ㄱㄷㅜㅁㅡㄷ Release checklist`

The line is sent to Claude Code as `/rename Release checklist`. Without this, the arguments would have been lost, or the command would not have been recognized.

This covers every command that reads text after its name: the ones sent straight to the CLI, the ones this app runs itself such as `/btw`, and `/model`.

## The title preview works too

The [title preview after `/rename `](../078-rename_session_names/en.md) appears when you type `/ㄱㄷㅜㅁㅡㄷ ` as well.

## Korean text is still searched as Korean

The list does not stop matching what you typed. Items with a Korean name, for example a Korean label for switching the model, are still found by typing that Korean word, such as `/모델`. Your text is searched as typed **and** as keys, and an item shows up if either one matches.

## What this does not do

- **Slash commands only.** `@` file references and `!!` prompt search are unchanged.
- **The standard Korean layout (two-set / dubeolsik) only.** Other Korean layouts such as three-set are not converted.
- **The list is one syllable behind while you are mid-syllable.** The Korean input method does not hand the box's text to the app until the syllable is finished, so the list reflects everything up to the last syllable you are still forming. It catches up as soon as you type the next letter or a space. English input has no such delay.
- **Commands with no Latin name are not a target.** This only maps Korean letters to the keys they sit on. It does not translate words.
- Sending a line that was never matched to a command, for example because the letters match nothing, sends it unchanged.
