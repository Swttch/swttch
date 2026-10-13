# Settings Badges

> Languages: **English** · [한국어](./ko.md)
>
> Related: this feature ships on the `feat/auto-resume-on-limit-reset` branch.

The Settings screen holds a mix of different kinds of options — some are real Claude Code CLI settings the GUI is editing on your behalf, others are extras that come with sponsoring the project. To make that distinction obvious at a glance, certain setting rows carry a small labelled **badge** right next to their title. Hover a badge and a tooltip tells you exactly what kind of setting it is.

![Settings → General showing the S and C badges next to setting rows](./assets/general-badges.png)

*The Settings → General screen. Notice the small S and C chips sitting next to certain rows.*

## The badges

There are four badge variants today, each a tiny letter chip:

| Badge | Glyph | Color | Meaning | Tooltip |
|-------|:-----:|-------|---------|---------|
| **Sponsor** | `S` | Blue | This row belongs to a **sponsor-only feature** | *Sponsor-only feature* |
| **Claude Code native** | `C` | Orange | This row edits a **real Claude Code CLI setting** | *Claude Code native setting* |
| **Project override** | `P` | Yellow | On the global tab: the open project sets this too, so the project's value is the one in effect | *The project overrides this. Changing it here has no effect* |
| **Inherited** | `G` | Gray | On the project tab: the project did not set this, so the value comes from your global settings | *Not set in this project. The global value is used* |
| **Project value** | `P` | Yellow | On the project tab: the project sets its own value for this, overriding the global one | *This project sets its own value, overriding the global one*, followed by a **Reset to global** link |

The **P** and **G** badges describe where a value comes from rather than what kind of setting it is. They are explained in [The project tab shows the setting that actually applies](../089-project_tab_shows_inherited_settings/en.md) and [Changing a global setting did nothing, and looked like it worked](../040-project_override_lock/en.md). The sections below cover **S** and **C**.

They're intentionally small and unobtrusive — a quiet signal, not a banner. You never have to interact with them, apart from the **Reset to global** link in the Project value badge's tooltip; they're just there to answer the question "what am I actually looking at?" when you want it answered.

## Sponsor badge (S)

The **S** badge marks a setting that belongs to a **sponsor-only feature**. When you see it, you know that row is one of the extras unlocked by supporting the project.

![The Sponsor badge tooltip reading "Sponsor-only feature"](./assets/sponsor-tooltip.png)

*Hovering the blue **S** badge shows "Sponsor-only feature".*

Claude Code with GUI stays free to use, and sponsoring is what keeps this independent, JetBrains-first project moving forward. Supporting the project unlocks every sponsor-only feature — the ones wearing this badge — plus all future ones, automatically. So think of the **S** badge as a friendly bookmark: it points out the goodies that come with sponsoring, in case you'd like them. If you'd rather not, that's completely fine — the core experience is free and stays free.

For example, **Auto-resume on usage limit** in Settings → General carries the **S** badge.

## Claude Code native badge (C)

The **C** badge marks a setting that is a **real Claude Code CLI setting** — the GUI is simply giving you a nicer way to edit it. This is different from a GUI-only convenience setting that lives only in the app. When you change a **C**-badged option, you're changing something the `claude` command-line tool itself understands.

![The Claude Code native badge tooltip with a docs link icon](./assets/claude-native-tooltip.png)

*Hovering the orange **C** badge shows "Claude Code native setting", with a link icon that opens the official docs for that setting.*

When the setting maps to an official Claude Code settings key, the tooltip includes a small external-link icon. Click it and the **official Claude Code documentation** for that exact key opens in a new browser tab — a one-click way to read the authoritative description straight from the source. Because the tooltip has a clickable link in this case, it's interactive: you can move your pointer off the badge and onto the link without the tooltip disappearing.

For example, **fileSuggestion** in Settings → General carries the **C** badge, and its tooltip links straight to that setting's page in the official docs.

## Where you'll see them

Badges show up wherever a setting row needs one of these signals — most visibly in **Settings → General**, and elsewhere in the settings screens next to native CLI options. You don't need to hunt for them; they simply appear on the rows they apply to.

## Notes

- Badges are **informational only**. They never change what a control does — they just label what kind of setting it is.
- A row can carry one badge for what kind of setting it is (**S** or **C**) and one for where its value comes from (**P** or **G**), so a single row can show two.
- The **C** badge's docs link always opens the official Claude Code documentation in a **new tab**, so you never lose your place in the app.
