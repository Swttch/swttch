# The microphone tells you why it cannot record

> Language: **English** · [한국어](./ko.md)

## What went wrong

Pressing the record button put a JavaScript error in the composer.

```
Cannot read properties of undefined (reading 'accessToken')
```

That is a line for whoever wrote the code, not for the person who wanted to talk. It says nothing about what is wrong and nothing about what to do next.

The reporter went and asked Claude in the chat what it meant, then filed [#355](https://github.com/Swttch/swttch/issues/355) with a single request:

> plugin should check somehow.. or deliver a better error message.

Plugin version 0.29.1 through 0.30.0 are affected.

## Why it happened

Voice input needs a **signed-in Claude account**.

The transcription stream is opened with the OAuth access token that signing in leaves on your machine. A machine authenticated only by `ANTHROPIC_API_KEY` never has that token.

The reporter was using an API key. So the code went looking for a token that was not there, walked into an empty value, and threw.

Two separate things then went wrong with how that was handled.

**Nothing checked first.** The backend already had a "can this machine dictate at all?" question written and ready. The screen never asked it. So the only way to find out was to press the button and fail.

**The failure was passed through raw.** Anything that was not a missing `@swttch/extend-kit` was labelled "unknown" and shown with whatever text the exception happened to carry. That is how a property-access error ended up in a banner.

There was a third, quieter problem. When the availability question *was* asked, every failure came back as **"the kit is not installed"** even when the kit was installed and current. Had the screen used that answer, it would have sent API-key users to install something they already had.

## What changed

**The microphone now looks unavailable before you press it.** When your machine cannot dictate, the button is dimmed and its tooltip says why.

It is dimmed, not hidden, and not disabled. Hiding it takes the feature off the screen for exactly the people who need to be told why they cannot have it. Disabling it swallows the press, which would leave the reason living only in a tooltip nobody has to hover.

**Pressing it explains, in your language.**

> Voice input needs a signed-in Claude account. An API key on its own cannot reach dictation.

Next to it is a **Sign in** button that goes to the same login page the top banner uses. The message is translated into all 12 interface languages.

**Nothing is opened before authorization is checked.** The microphone is not turned on and no socket is opened, so the recording indicator never lights up for a session that could not have transcribed a word.

**Settings → General → Voice input says it too.** The section already told you when the kit was missing. Now it also tells you when the kit is fine but the login is not, and dims the rows underneath. The on/off toggle stays usable, because that toggle is the way back for anyone who turned voice input off.

**A missing kit and a missing login are no longer confused.** Only an actually missing kit is reported as one.

## Why we do not just use your API key

Because no official Claude Code client does.

The official CLI carries a dedicated failure for this exact situation:

```
[voice_stream] No OAuth token available
```

It declines before connecting rather than falling back to an API key it is perfectly capable of sending to other endpoints. This plugin follows the CLI rather than inventing around it, so it declines in the same place, and simply explains itself better.

Whether the transcription service *would* accept an API key has never been measured, because no client asks it. So "an API key cannot dictate" is a fact about every Claude Code client, which is what you experience, rather than a claim about the service itself.

## If you want voice input

Sign in with a Claude account, from the **Sign in** button on the banner or from the account menu. Dictation works from the next press.
