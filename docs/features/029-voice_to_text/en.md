# Speak into the chat instead of typing it

> Language: **English** · [한국어](./ko.md)
>
> Related: [#235](https://github.com/Swttch/swttch/issues/235)

## The report

A user described the workaround they had settled into: for anything long, they dictated into the
Claude Desktop app, then copied the text and pasted it into the plugin. They asked whether the
recording could just happen here, and mentioned they speak German rather than English — accuracy
away from English is usually worse, but good enough, and still far faster than typing.

## Why this took a detour

The obvious route was the browser's built-in speech API. It is not available in the WebView that
JetBrains IDEs use, so that route was closed before it started.

The next question was how the other Claude Code clients do it, since they clearly manage it. Both
the desktop app and the VS Code extension call a private Anthropic endpoint — and calling it means
**sending the account's credentials.**

That is the wall. A JetBrains plugin is not permitted to handle credentials, so this could not be
built into the plugin, no matter how the UI was arranged.

## How it was solved

**By putting the part that touches credentials outside the plugin.**

The transcription code lives in [`@swttch/extend-kit`](https://www.npmjs.com/package/@swttch/extend-kit),
a package installed on your own machine — the same arrangement the usage panel already uses for
`ccb`. The plugin ships no credential-handling code; it asks the kit, and the kit uses the Claude
Code login already on your machine.

The practical consequences of that choice:

- **No separate API key, and no separate bill.** It authenticates as the account you are already
  signed into, so dictation costs you nothing beyond what Claude Code already does.
- **The same quality as the other clients**, because it is the same service, not a substitute.
- **One prerequisite**: the kit has to be installed. If it is missing, the plugin says so rather
  than failing quietly.

## Using it

A microphone button sits at the top right of the input box. `⌘D` (`Ctrl+D` on Windows and Linux)
toggles it too.

**Tap it** and recording starts and stays on; tap again to finish. Good for dictating something
long.

**Hold it** and recording lasts only as long as you hold; releasing ends it. Good for a sentence
or two.

You do not have to choose between them. The button tells them apart by how long it was held.

While you speak, the text appears **inside the input box**, italic and dimmed — that is the
recognizer still making up its mind, and it rewrites itself constantly. When a phrase settles it
turns into ordinary text in place.

Dictation **splices at the caret.** Put the caret mid-sentence and speak, and the words go there;
nothing already typed is lost. If you start typing while it is writing, dictation stops rather
than overwriting what you just typed.

While recording, three bars appear beside the microphone and rise with your voice. That is
deliberate: a muted microphone or the wrong input device looks exactly like a working one until no
text arrives, and the bars are the difference.

## When it cannot start

Three different failures, three different messages, because they need three different fixes:

| What you see | What happened |
| --- | --- |
| Microphone access is denied in system settings | The OS or the browser is blocking the microphone |
| No microphone was found | No input device is connected |
| Voice input needs @swttch/extend-kit | The kit is not installed on this machine |

If Claude Code is not logged in on this machine, dictation is unavailable for the same reason the
usage panel is — there is no account to authenticate as.

## A note on stability

This uses an endpoint Anthropic has not documented, the same one the other clients use. It could
change without warning. The client ignores anything it does not recognise rather than breaking, but
a larger change on their side could still stop dictation working until we catch up.
