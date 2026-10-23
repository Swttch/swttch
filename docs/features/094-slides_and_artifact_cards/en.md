# `/slides` works here now, and an Artifact has a card with a link

> Language: **English** · [한국어](./ko.md)

## What went wrong

In a terminal, typing `/sli` in Claude Code shows `/slides` in the command list. In this chat it was not there. Sending `/slides` anyway got this answer from Claude Code:

> /slides isn't installed in this session

Anyone who had made a slide deck in the terminal had no way to do the same here. The same was true of the other Artifact features, like publishing a page or reading the comments on one.

## Why it happened

An Artifact is a page that Claude Code publishes from your session to a private address on claude.ai. Claude Code decides for each session whether Artifacts exist at all.

The Claude Code documentation says they are off by default when Claude Code runs as part of another program: in the Agent SDK, in the GitHub Action, and when you start it with `-p` from your own scripts. This chat starts Claude Code that way, so it was in the "off" group. A terminal session is not in that group, so a terminal user got `/slides` without doing anything.

The documentation does not say how to turn Artifacts on for such a session. Claude Code itself has a switch for it, an environment variable named `CLAUDE_CODE_ARTIFACT`. When this chat starts Claude Code, it now sets that switch, so the session is treated like a terminal session.

## What you see now

![The chat input with "/sli" typed. The "Slash Commands" list above it has "/slides  Make a new Slides deck artifact from a brief" as its first, highlighted entry, followed by "/google-workspace" and "/pptx". The list's footer reads "v0.34.7 · Claude Code v2.1.309".](./assets/slides-menu.png)

`/slides` is in the command list. Type `/slides` and a short brief:

```text
/slides a quarterly review of the platform team's reliability work, for the engineering all-hands
```

Claude creates a Slides artifact and tells you where it is. If you send `/slides` without a brief, Claude asks what the deck should be about before it creates anything.

While it works, each call to the Artifact tool shows as a card in the chat:

![Two cards in the chat, one above the other. The first is headed "Artifact quickstart slides", with a claude.ai address under it and an OUT box that begins "Quickstart for a slide deck." The second is headed "Artifact Swttch slides test", with its own claude.ai address under it and an OUT box that begins "Created a new Artifact at https://claude.ai/artifact/…".](./assets/artifact-card.png)

| Part of the card | What it is |
| --- | --- |
| The name next to the dot | Which tool was called: `Artifact`, `ArtifactComments` (reading and answering comments on a page) or `ArtifactData` (a page's own stored data) |
| The action and subject beside the name | What the call does and what it is about: `quickstart slides`, the title of a page being created, or the collection of a data call |
| The link under it | The page that was created or updated. Click it and the page opens in your default browser, the same as a terminal does |
| The OUT box | Claude Code's own answer to the call, shown as it came |

A `/slides` run usually makes two calls like the two cards above. The first, `quickstart`, asks Claude Code which template to use, and the link on that card is the Slides template's own page, which Claude Code names in its answer. The second creates your deck, and the link on that card is your new page. A later update to the same deck shows the same address again.

`/design` comes back the same way. Run it with a brief, such as `/design a settings screen for a mobile banking app`, and Claude drafts the screens as artboards on one canvas and publishes it as a Design artifact. It needs the Design template turned on, as `/slides` needs the Slides one.

A new Artifact is private to you. To share it, open the page and use **Share** in its header.

## What `/slides` needs

None of these is something this chat decides. They are Claude Code's own conditions, and it applies them exactly as it does in a terminal.

| Needed | Detail |
| --- | --- |
| A claude.ai login | Sessions that use an API key, a gateway token or a cloud provider's credentials cannot publish Artifacts |
| A plan | Pro, Max, Team or Enterprise |
| Claude Code 2.1.265 or later | The version `/slides` first appeared in |
| The Slides template turned on | On Team and Enterprise plans an organization owner controls this. If it is off, `/slides` is not in the list |
| The Anthropic API | Not available through Amazon Bedrock, Google Cloud or Microsoft Foundry |

If your account does not meet them, `/slides` does not appear, the same as in a terminal.

## Turning Artifacts off

Any of the official ways works here too:

- Set `"enableArtifact": false` in your Claude Code settings.
- Set `CLAUDE_CODE_DISABLE_ARTIFACT=1` in the environment that starts the IDE.
- Add `Artifact` to `permissions.deny`.

If you set `CLAUDE_CODE_ARTIFACT` yourself in the environment that starts the IDE, including `0`, this chat leaves your value alone.

## What has not changed

This chat does not show the page itself. It gives you the link, and the page opens in your browser. Claude Code in a terminal does the same and also opens the browser by itself after the first publish; this chat does not open it for you yet. Showing the page inside the IDE, opening it for you, and the terminal's `/artifacts` list are being tracked in [#593](https://github.com/Swttch/swttch/issues/593).

---

Reported in [#584](https://github.com/Swttch/swttch/issues/584). The exception this relies on is recorded in [584-artifact-env-for-slides.md](../../principle-exceptions/584-artifact-env-for-slides.md).
