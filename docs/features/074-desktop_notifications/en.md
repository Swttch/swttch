# The session calls you back when you have walked away

> Language: **English** · [한국어](./ko.md)

This is for people who send Claude a long job and then go and do something else.

Before, the only way to know the turn had ended was to go back and look.

Now your operating system taps you on the shoulder, and clicking that tap puts you
back in the session that sent it.

## What you see

When a session finishes its response, or stops to wait for your confirmation,
**while you are looking somewhere else**, a notification appears from your desktop
— the same kind of notification your mail client uses, not something drawn inside
the IDE.

It says which session it came from, and it carries the plugin's logo so you can
tell at a glance who is calling.

**Click it and the IDE comes forward, on that session's tab.** Not the IDE in
general, and not whichever session you last had open — the one that finished.

Nothing appears while you are watching that session. The notification exists to
reach someone who is not there.

## Where to turn it on and off

**Settings → General → Notifications.**

| Control | What it does |
|---|---|
| **Sound** | Which sound plays when a turn ends. Choosing one plays it once, so you can hear it before you commit. **Off** silences it |
| **Volume** | How loud that sound is, 1 to 10 |
| **Banner** | Whether the on-screen notification appears at all |

The two are independent on purpose. **Turning the banner off does not silence the
sound**, because a sound is still worth hearing while you are looking at the
session, and a banner is not. Each has its own Off.

## The first banner asks for permission

On macOS, the first notification the plugin sends is itself the request. macOS
shows its own allow/deny prompt, and whatever you answer is remembered — allow and
banners keep coming, deny and they stop. The plugin never asks twice and never
puts a prompt of its own in front of the operating system's.

Windows and Linux have no such prompt; the first banner simply appears.

### macOS: "my banner disappears too quickly"

macOS decides whether a notification fades after a few seconds or stays until you
dismiss it, and **only you can change that** — no application can choose it for
you. The default is to fade, which is the wrong setting for a notification whose
entire job is to reach someone who is not at the screen.

So the plugin does two things. Right after you allow notifications it opens the
macOS setting for you, and the Banner toggle in Settings grows a hint line —
*Banner disappearing too fast? Change it here* — that takes you to the same place.

The hint only shows while the setting is still on the fading option. Once you have
changed it, the plugin stops mentioning it.

On Windows and Linux the notification decides its own lifetime, so there is
nothing to ask you about.

## Sound

The list is your operating system's own notification sounds, and the plugin plays
the one you pick, once per finished turn. It does not invent sounds of its own.

If your desktop normally plays a chime of its own for every notification, you will
not hear it doubled here: the plugin asks it to stay quiet, because you already
chose the sound you wanted.

## What happens to the IDE's own popup

When the IDE is in front you get its ordinary popup instead of a desktop
notification, with the same **Open session** action, and it also lands in the
Event Log so you can find it later.

If you were away and clicked the desktop notification, **that popup goes away with
it.** The two are one announcement with two faces, and answering either answers
both — you should not arrive at the session you asked for and still be asked to
open it. For the same reason a session keeps only its newest popup; a long
afternoon of turns does not leave a stack of them behind.

## Where it works

On macOS, Windows and Linux, from inside the IDE.

In a browser (standalone mode) your browser draws its own notification, and
clicking it focuses the tab that session lives in, which is already the session.

On Linux the details depend on which notification daemon your desktop runs, not on
your distribution. Both of the common cases are handled: the banner appears,
carries the logo, and returns you to the session on either one.
