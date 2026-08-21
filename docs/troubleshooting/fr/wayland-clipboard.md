# Le collage ne fonctionne pas lorsque l'IDE JetBrains s'exécute sous Wayland

🌐 [English](../en/wayland-clipboard.md) | [한국어](../ko/wayland-clipboard.md) | [日本語](../ja/wayland-clipboard.md) | [中文](../zh/wayland-clipboard.md) | [Español](../es/wayland-clipboard.md) | [Deutsch](../de/wayland-clipboard.md) | **Français**

_Dernière mise à jour : 2026-08-22_

## Symptômes

Le collage dans le champ de saisie du chat du plugin échoue sans qu'il ne se passe rien.

Aucun message d'erreur n'apparaît non plus.

Un détail est révélateur.

Le texte copié **à l'intérieur** du plugin se colle sans problème, alors que celui copié **à l'extérieur** — depuis un navigateur, un terminal, l'éditeur de l'IDE — échoue.

Dans l'éditeur de code du même IDE et dans les champs de recherche, le collage fonctionne normalement.

Cela ne concerne pas que le texte. **Les images, comme les captures d'écran, échouent de la même façon.**

## Environnements concernés

Cela se produit sous Linux, dans une session Wayland, sur le bureau KDE Plasma.

Cela a été confirmé jusqu'ici sur Fedora 44, Ubuntu 26.04 et CachyOS.

Une personne est passée à GNOME et le problème a disparu.

## Cause

Le presse-papiers ne semble pas relié entre la prise en charge de Wayland par le JetBrains Runtime (Project Wakefield) et JCEF, si bien que l'IDE et JCEF regardent des presse-papiers distincts.

L'interface du plugin est dessinée sur JCEF, ce qui explique qu'elle soit touchée.

Le même symptôme est signalé dans d'autres plugins JetBrains qui utilisent JCEF.

Comme le presse-papiers est rompu avant même d'atteindre le plugin, nous n'avons pas encore trouvé de moyen de corriger cela dans le seul code du plugin.

## Comment le corriger

Ouvrez `Help → Edit Custom VM Options`, ajoutez la ligne ci-dessous, puis redémarrez l'IDE.

```
-Dawt.toolkit.name=XToolkit
```

Si vous avez déjà une ligne commençant par `-Dawt.toolkit.name=` (par exemple `auto` ou `WLToolkit`), remplacez-la par celle ci-dessus.

Trois personnes ont confirmé que cela fonctionne, chacune sur une distribution différente.

## À garder à l'esprit

Ce réglage ramène l'IDE sur XWayland.

Par conséquent, **l'affichage peut paraître flou si vous utilisez une mise à l'échelle fractionnaire comme 125 % ou 150 %.**

C'est un contournement temporaire, pas une vraie correction.

Si le flou vous gêne plus que le problème de collage, vous pouvez revenir en arrière.

## Quand cela disparaîtra-t-il

Ce ne sera plus nécessaire une fois que la prise en charge native de Wayland par JetBrains sera stable.

Le ticket associé [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) est toujours ouvert.

Voter pour lui aide à en relever la priorité.

## Liens associés

### Issues de ce dépôt

- [#278 — Cannot paste external text into chat input on Fedora KDE (Wayland)](https://github.com/Swttch/swttch/issues/278)
- [#262 — no paste function at linux fedora](https://github.com/Swttch/swttch/issues/262)

### Tickets JetBrains

- [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) — le problème de presse-papiers avec JCEF. **Toujours ouvert, et vous pouvez voter**
- [JBR-10222](https://youtrack.jetbrains.com/issue/JBR-10222) — fermé comme « Third-Party problem », considéré comme un bug de KDE
- [JBR-5857](https://youtrack.jetbrains.com/issue/JBR-5857) — prise en charge du presse-papiers Wayland, marquée corrigée en 2024
- [JBR-10504](https://youtrack.jetbrains.com/issue/JBR-10504) — impossible de copier depuis un aperçu JCEF sous Arch/Hyprland
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — la prise en charge native de Wayland est elle-même toujours en cours
- [PY-76704](https://youtrack.jetbrains.com/issue/PY-76704) — le signalement d'origine concernant le plugin Continue, fermé comme doublon de JBR-5857

### Le même symptôme dans d'autres plugins

- [cline/cline#8877](https://github.com/cline/cline/issues/8877) — ouvert
- [cline/cline#8383](https://github.com/cline/cline/issues/8383) — le mainteneur a [indiqué](https://github.com/cline/cline/issues/8383#issuecomment-4173099236) que cela ne peut pas être corrigé côté plugin
- [Kilo-Org/kilocode#8998](https://github.com/Kilo-Org/kilocode/issues/8998) — signalé sur Fedora 43/44, Arch, Kubuntu 26.04 et d'autres
- [continuedev/continue#2567](https://github.com/continuedev/continue/issues/2567)

### Références externes

- [KDE bug 490577](https://bugs.kde.org/show_bug.cgi?id=490577) — le bug KDE désigné par JetBrains lors de la fermeture de JBR-10222. Il a toutefois déjà été corrigé dans Plasma 6.2.0, et les personnes qui signalent le problème ici utilisent des versions plus récentes
