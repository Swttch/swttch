# Le collage ne fonctionne pas lorsque l'IDE JetBrains s'exécute sous Wayland

🌐 [English](../en/wayland-clipboard.md) | [한국어](../ko/wayland-clipboard.md) | [日本語](../ja/wayland-clipboard.md) | [中文](../zh/wayland-clipboard.md) | [Español](../es/wayland-clipboard.md) | [Deutsch](../de/wayland-clipboard.md) | **Français**

_Dernière mise à jour : 2026-10-05_

## Symptômes

Le collage dans le champ de saisie du chat du plugin échoue sans qu'il ne se passe rien.

Aucun message d'erreur n'apparaît non plus.

Un détail est révélateur.

Le texte copié **à l'intérieur** du plugin se colle sans problème, alors que celui copié **à l'extérieur** — depuis un navigateur, un terminal, l'éditeur de l'IDE — échoue.

Dans l'éditeur de code du même IDE et dans les champs de recherche, le collage fonctionne normalement.

Cela ne concerne pas que le texte. **Les images, comme les captures d'écran, échouent de la même façon.**

## Environnements concernés

Cela se produit sous Linux, dans une session Wayland, lorsque l'IDE lui-même s'exécute comme un programme Wayland natif.

Le réglage par défaut `-Dawt.toolkit.name=auto` peut choisir ce mode, et `WLToolkit` le force.

Cela a été signalé jusqu'ici sur Fedora 44, Ubuntu 26.04 et CachyOS, toujours sur le bureau KDE Plasma.

Nous avons reproduit le même symptôme dans une session de test avec le compositeur sway, avec l'IDE 2025.3.4 comme avec l'IDE 2026.2.3.

Une personne est passée à GNOME et le problème a disparu.

## Cause

L'écran du plugin est dessiné par JCEF, le moteur de navigateur intégré à l'IDE.

Dans les IDE que nous avons testés (2025.3.4 et 2026.2.3), JCEF s'exécute dans un processus séparé, et ce processus atteint l'affichage par XWayland, la couche de compatibilité pour les programmes X11.

La fenêtre de l'IDE est elle-même une fenêtre Wayland native.

Le texte copié en dehors du plugin se trouve dans le presse-papiers Wayland.

XWayland ne transmet le presse-papiers Wayland aux programmes X11 que tant qu'une fenêtre X11 a le focus.

La fenêtre de l'IDE est une fenêtre Wayland, cette transmission n'a donc jamais lieu et JCEF voit un presse-papiers vide.

Le texte copié à l'intérieur du plugin arrive dans le presse-papiers X11, ce qui explique que ce texte se colle sans problème.

Nous avons mesuré cette transmission sur trois compositeurs : sway, KWin 5.27.5 et KWin 6.7.5 (Plasma 6.7, la même série que sur Fedora 44).

Sur les trois, un programme X11 ne pouvait pas lire le presse-papiers Wayland tant qu'une fenêtre Wayland avait le focus, et pouvait le lire tant qu'une fenêtre X11 avait le focus.

Avec `-Dawt.toolkit.name=XToolkit`, la fenêtre de l'IDE devient elle-même une fenêtre X11 : le presse-papiers est transmis et le collage fonctionne.

Le même symptôme est signalé dans d'autres plugins JetBrains qui utilisent JCEF.

Le processus de l'IDE lui-même peut lire ce presse-papiers, donc les versions récentes du plugin le demandent à l'IDE chaque fois qu'un collage arrive vide, et le collage fonctionne alors sans aucun réglage.

Si vous utilisez une version plus ancienne, ou si un collage échoue encore, utilisez le réglage ci-dessous.

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

Une personne sous Arch Linux (omarchy) a signalé qu'avec ce réglage, les fenêtres flottantes de l'IDE, comme les menus contextuels, apparaissent au mauvais endroit.

Nous n'avons pas pu le reproduire sous sway, où les menus et les fenêtres contextuelles s'ouvraient au bon endroit, même avec une mise à l'échelle de 150 %.

Si vous le constatez, dites-nous quel bureau ou quel compositeur vous utilisez.

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
