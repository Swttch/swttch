# The project tab shows the setting that actually applies

> Language: **English** · [한국어](./ko.md)

## What was reported

In [#547](https://github.com/Swttch/swttch/issues/547) a user wrote that a message typed while Claude was working used to go straight through, and in the newer version it waited in a queue until the whole turn was over.

Two separate things were wrong, and both are fixed.

1. **The default for "Follow-up behavior" had become Queue.** Since v0.33.0 the Queue choice really holds a message back, and anyone who had never opened the setting was suddenly on it. The default is Steer again.
2. **The project tab of the settings screen drew the wrong value.** It showed what the project's own file said, and a project file only holds the settings that project changed. A setting the project said nothing about came back as "nothing", and each row filled in its own built-in value instead of the global one. With Steer set globally, the project tab could show Queue while the composer, which reads the value that really applies, behaved as Steer.

## Follow-up behavior

**Settings > General > Composer > Follow-up behavior** decides what happens to a message you send while Claude is working.

| Choice | What your message does |
| --- | --- |
| **Steer** | Goes to Claude right away. Claude takes it at the next point where it accepts input, the same as when you type into the terminal while the CLI is working. This is the default. |
| **Queue** | Waits above the composer until the current turn ends, then is sent. Each waiting message can be cancelled before it goes. |

If you never chose, the row shows Steer. The composer's placeholder tells you which one is in effect while a turn is running: "Steer the current run..." or "Queue another message...".

## Two tabs, one rule

Most settings pages have a switch at the top: **User Settings (Global)** and **Project Settings (Local)**. The value that applies to a project is found in this order:

1. what the project set,
2. otherwise what you set globally,
3. otherwise the built-in default.

The **User Settings (Global)** tab shows your global file, with the built-in defaults underneath. The **Project Settings (Local)** tab shows the value that applies to the open project, whichever of the three it comes from.

![Settings on the Project Settings (Local) tab, scrolled to the Composer section. The Send shortcut, Newline shortcut and Follow-up behavior rows each have a small G badge beside the label, and Follow-up behavior reads "Queue", the value chosen on the global tab.](./assets/project-tab-inherits-global.png)

*The Project tab, with Queue chosen globally and nothing chosen for the project. The row reads Queue, and the small **G** beside the label says the project did not set it.*

## The badges

| Badge | Where | Meaning |
| --- | --- | --- |
| **G** | Project tab | The project did not set this. The value on screen comes from your global settings, or from the built-in default when you have not set it globally either. Tooltip: "Not set in this project. The global value is used". |
| **P** | Project tab | The project sets its own value for this, overriding your global one. Tooltip: "This project sets its own value, overriding the global one", with a **Reset to global** link at its right end. See [Taking a project's value back](#taking-a-projects-value-back). |
| **P** | Global tab | The open project sets this too, so the row is dimmed and cannot be edited here. The value in effect is the project's. Tooltip: "The project overrides this. Changing it here has no effect". |
| no badge | Either tab | The value shown comes from the tab you are looking at and nothing overrides it. |

The **C** (Claude Code native setting) and **S** (sponsor feature) badges are unchanged. See [Settings Badges](../017-settings_badges/en.md).

![The same rows on the Project tab after the project chose Steer. Follow-up behavior reads "Steer" and has a P badge, while Send shortcut and Newline shortcut still have the G badge.](./assets/project-tab-own-value.png)

*Once the project chooses its own value, that row's **G** badge becomes a **P** badge. The rows the project did not touch keep their **G**.*

![The Global tab with the project overriding Follow-up behavior. The row has a P badge and its dropdown is dimmed, reading "Queue".](./assets/global-tab-project-overrides.png)

*The Global tab while the project sets its own follow-up behavior. The dimmed row carries a **P** badge.*

## Choosing a value on the Project tab

Picking a value on the Project tab stores it in the project, even if it is the same value you inherit. That is how a project pins a value so a later change to your global settings does not reach it.

## Taking a project's value back

Every row on the Project tab that holds a value of its own shows the **P** badge beside its label. Hover the badge and its tooltip says the project overrides the global value, with a **Reset to global** link at the right end. Clicking the link removes the project's value, the **P** badge turns back into **G**, and the row shows what you set globally.

![The Project tab with the pointer on the P badge of Follow-up behavior. A tooltip reads "This project sets its own value, overriding the global one" and ends with a blue "Reset to global" link.](./assets/project-tab-reset-link.png)

*Hover the **P** badge. The link sits at the right end of the tooltip, and the tooltip stays open while the pointer moves onto it.*

This works the same for every kind of row: switches, text fields, dropdowns, number fields and the shortcut recorders.

Dropdowns that can be set per project also offer **Not set (use global)** at the top of the list, but only while the project has a value of its own to take back. It does the same thing as the link.

![The Follow-up behavior dropdown open on the Project tab with its own value. The list reads "Not set (use global)", "Queue" and "Steer" with a check mark.](./assets/project-tab-not-set-option.png)

*Open the dropdown on a row where the project has its own value, and the first entry is **Not set (use global)**.*

This is offered on Follow-up behavior, Log level, Color theme, Interface language and Default permission mode. The number fields (font size, line spacing, scroll threshold) go back to the global value when you empty them.

## Limits that come from the project file

- **Sound cannot be set to Off for one project.** In the project file an empty value means "remove my override", so choosing Off on the Project tab removes the project's value instead of storing "off".
- **The voice settings are stored together.** The spoken language, wait time and shortcut live in one block. When a project changes one of them, it stores all three as they were on screen at that moment, so the others do not silently change. A later change to your global voice settings then no longer reaches that project. For the same reason, **Reset to global** on one voice row takes back the whole block, and all the voice rows return to the global values together.
- **A shortcut and its recorded combination go together.** **Reset to global** on the send or newline shortcut also removes the recorded "custom" combination the project stored beside it.

## Rows that only exist globally

A few settings apply to the whole app and are always saved to your global file: **Enable RTL(Right-to-left)**, **Preferred Location**, **Open Settings as**, **Paginate chat history**, **Block nonessential traffic** and **Allow all command in all sessions**. On the Project tab they are dimmed and cannot be changed, and they show the value in effect. Before, some of them looked editable on the Project tab and saved to your global file anyway.

## Pages without the switch

The IDE, Privacy, Account & Pool, Usage, Tunnel, Releases, Browser, About and Sponsor pages have no Global/Project switch. They always use your global settings. Before, a page like IDE could keep the "Project" choice you made on General and read and save the project's file while showing no switch at all. Leaving for one of these pages now puts the settings back on Global, and the switch on the next page that has one starts from Global.

## Notes

- Issues: [#547](https://github.com/Swttch/swttch/issues/547), and [#344](https://github.com/Swttch/swttch/issues/344) for the **P** badge.
- Related docs: [The follow-up behavior setting](../070-composer_send_and_newline_keys/en.md), [Changing a global setting did nothing, and looked like it worked](../040-project_override_lock/en.md), [Settings Badges](../017-settings_badges/en.md).
