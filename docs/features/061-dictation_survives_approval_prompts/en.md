# Dictation keeps running when an approval prompt appears

> Language: **English** · [한국어](./ko.md)
>
> Related: [#409](https://github.com/Swttch/swttch/issues/409)

## The report

A user on WebStorm described this. While Claude was working, they were dictating the message they wanted to send next, and every time a prompt appeared asking them to approve a tool call or a file edit, **the recording stopped right then.**

The cost was not really the stop itself. They had to notice mid-sentence that the microphone had gone quiet, turn it back on, and say the whole thing again. On a long message that is a lot to repeat.

## Why it stopped

The dictation session lived **inside the composer.**

The slot at the foot of the chat is not the composer's alone. Whenever something needs approving, the composer steps aside and the approval prompt takes that slot. So the moment a prompt appears, **the composer is gone from the screen.**

Something goes with it. Part of the composer's cleanup released the microphone, so one piece of the screen disappearing also switched the microphone off.

This was never a conflict between approving and dictating. The real fault was that **a recording's life was tied to a piece of the screen.** A recording should last until the speaker stops talking, not until a component happens to unmount.

## What changed

The dictation session now belongs to the **whole chat screen** rather than the composer.

An approval prompt can take the composer's slot and the microphone stays open. Deal with the prompt, the composer comes back, and the recording has been running the entire time.

## While the composer is away, a notice stands in for it

Everything that showed a recording was in the composer: the microphone button, the bars that move with your voice, and the place the transcribed words appear. When the composer steps aside, all of that goes with it.

A recording that continues with nothing on screen to say so is worse than one that stopped, because you cannot tell whether the sentence you are speaking is being kept.

So while the composer is away, a **notice appears directly above the approval prompt.**

![A thin notice above the approval prompt, with voice level bars and the text "Still listening. What you say is kept in the composer." on the left and a "Stop recording" button on the right](./assets/listening-during-approval.png)

It carries three things.

- **Voice level bars** — the same bars that sit beside the microphone button. A muted microphone or the wrong input device shows up here immediately.
- **What is happening and where the words go** — that recording is live, and that what you say is landing in the composer.
- **A stop button** — the microphone button is off screen, so the way to stop has to be here.

**The notice disappears when the composer returns.** The microphone button is visible again, and there is no reason to say the same thing in two places.

## You can also start dictating while a prompt is up

One more thing came unstuck with this change.

The dictation shortcut (`⌥D` by default, `Alt+D` on Windows and Linux) was always meant to work **from anywhere on screen.** The whole point of a shortcut is to start talking without reaching for the microphone button, and that is usually a moment when the composer does not have focus.

But the code listening for that shortcut lived in the composer too. So while an approval prompt was up, **pressing the shortcut did nothing at all.** There was no way to start.

Now the shortcut works while a prompt is up. If you are reading a prompt and think "approve this, then ask for that next", you can start speaking before you answer it.

The shortcut can be rebound under **Settings → General → Voice input → Shortcut**. See [Speak instead of typing](../029-voice_to_text/en.md) for the details.

## Where the words go

**Into the composer's draft,** even while the composer is off screen.

The text dictation writes into was always held outside the composer. What steps aside is the part that **displays** it, not the text itself. So words spoken during an approval prompt land in the draft as usual, and when you answer the prompt and the composer returns, everything you said is already there.

One thing does differ: **where in the draft the words land.**

With the composer visible, dictation **inserts at the caret.** Put the caret mid-sentence and speak, and the words go there. With no composer on screen there is no caret, so the words are **appended to the end of the draft.**

Appending is the only choice that cannot lose text. Guessing at a position and inserting there could push aside or overwrite something you already wrote.

## Silence still ends a recording

Dictation has always had a rule that **ends a recording when nobody is talking.** The default is 15 seconds, and what it measures is the quiet, not the total length of the recording. Keep talking and it never fires; every pause restarts the clock.

That rule applies while an approval prompt is up too. So **a long pause while you read what you are approving can end the recording.**

It used to end silently. With the composer off screen there was no microphone button to watch go dark, so you could keep talking and only find out later that nothing had arrived.

Now it tells you why it stopped.

![The notice above the approval prompt reads "Recording stopped after a silence." with a "Record again" button and an X to dismiss it](./assets/stopped-by-silence.png)

**Record again** starts a new recording on the spot, so you do not have to answer the prompt first just to reach the microphone button. The **X** dismisses the notice without starting anything.

### The timeout cannot be made longer

You can change it under **Settings → General → Voice input → Silence timeout**, but **only downwards.** 15 seconds is both the default and the ceiling.

That is not us being stingy. It is a promise we could not keep. The transcription service itself stops listening after that much silence. Setting our own clock to 20 seconds would not buy you five more seconds of anything, because the service has already hung up. The screen would say you are recording while nothing was being received, which is worse than what happens now.

For the same reason there is no "never stop" option.

So the most we can do about a limit we cannot move is **make it visible.** If a constraint cannot be removed, it should at least not be silent.

## Questions you may have

**Why does the composer disappear when a prompt appears?**

The approval prompt has a text field of its own — the one reading "Tell Claude what to do instead" — where you can deny the request and say why. Leaving the composer in place would put two text fields on screen at once, and you could not tell whether what you are writing is your next message or a reason for refusing. So only one is shown at a time.

**Can I still press the number keys to approve while recording?**

Yes. `1`, `2` and `3` work as usual, and dictation being on changes nothing. The exception is when focus is inside a text field, where a number key types a number. That has always been the case.

**Will answering the prompt mid-sentence cut off what I am saying?**

No. Approving does not touch the recording. The composer comes back, everything said so far is in the draft, and the recording continues.

**If I leave the prompt unanswered, does the microphone stay on forever?**

No. The silence rule above keeps running, so a recording with no speech ends after 15 seconds. Walking away with a prompt open does not leave the microphone open indefinitely.

**What happens if I leave the chat screen?**

The recording ends and the microphone closes. Dictation writes into the chat composer, so continuing to record on a screen with no composer would pile up text where nobody can see it.

**How do I know the recording is still going?**

With the composer visible, the microphone button lights up and grows level bars beside it. With the composer away, the notice above the prompt does the same job. In both cases, **watch whether the bars move with your voice.** Bars that do not move mean a muted microphone or the wrong input device.

**Dictation will not start at all.**

That is a different problem from the one this document covers. Check microphone permission, whether `@swttch/extend-kit` is installed, and whether this machine has a Claude login. See the "When it cannot start" section of [Speak instead of typing](../029-voice_to_text/en.md) and [Dictation needs a Claude login](../058-dictation_needs_a_claude_login/en.md).

## What this change does not do

**Typing still stops dictation.** That is deliberate rather than a leftover: it keeps dictation from overwriting characters you typed yourself.

**Nothing is sent automatically.** Dictation puts text in the draft; sending it stays your decision.

**You cannot read the dictated text while a prompt is up.** It goes into the composer's draft, and the composer is not on screen. The notice tells you the words are being kept but does not show them. Answer the prompt and they are all there.

## Related documents

- [Speak instead of typing](../029-voice_to_text/en.md) — dictation overall: shortcut, spoken language, silence timeout
- [The first-use question for voice input](../031-voice_first_use_prompt/en.md) — the question asked the first time you press the microphone
- [Dictation needs a Claude login](../058-dictation_needs_a_claude_login/en.md) — what happens without a login
