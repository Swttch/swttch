# Les sessions créées dans le plugin n'apparaissent pas dans l'onglet Code de Claude Desktop

🌐 [English](../en/desktop-session-import.md) | [한국어](../ko/desktop-session-import.md) | [日本語](../ja/desktop-session-import.md) | [中文](../zh/desktop-session-import.md) | [Español](../es/desktop-session-import.md) | [Deutsch](../de/desktop-session-import.md) | **Français**

_Dernière mise à jour : 2026-11-09_

Une session créée dans le plugin n'apparaît pas d'elle-même dans l'onglet Code de Claude Desktop. Dans l'autre sens, ouvrir dans le plugin une session créée dans Desktop, cela fonctionne depuis le début. Le fichier dont Desktop tire sa liste n'est pas documenté, et nous ne pouvons pas y écrire à votre place. Il existe en revanche une solution : **lancer une fois l'import de sessions intégré à Desktop**. À partir de la v0.36.0, les nouvelles sessions sont démarrées de façon que cet import les reconnaisse, et celles créées avant peuvent être préparées d'un clic dans les paramètres.

## Symptômes

- Une session que vous utilisiez dans le plugin est absente de la liste à gauche de l'onglet Code de Claude Desktop
- Dans le même dossier, `claude --resume` dans un terminal ouvre cette session. La conversation est toujours là
- Les sessions démarrées dans Desktop apparaissent en revanche dans la liste des sessions du plugin

## Cause

Desktop n'affiche pas les fichiers de conversation tels quels : il construit sa liste à partir d'un index qui lui est propre, et une session absente de l'index n'apparaît pas, même si son fichier existe.

Ce qui ajoute des sessions à cet index, c'est la fonction **Importer les sessions CLI de Claude Code** de Desktop. Or cet import ignore toute session dont l'enregistrement indique `sdk-cli`. Le plugin démarre Claude de la même façon non interactive que les outils SDK, si bien que, auparavant, l'enregistrement de chaque session indiquait `sdk-cli`.

À partir de la v0.36.0, le plugin démarre les nouvelles sessions sous un nom qui lui est propre : `swttch-jetbrains` dans un IDE et `swttch-standalone` dans le navigateur (`ccg`). L'import de Desktop accepte ces noms.

## Comment résoudre le problème

### 1. Si vous avez des sessions d'avant la v0.36.0 : les préparer dans le plugin

**Paramètres → Général → Préparer les sessions pour les importer dans Claude Desktop → Préparer**

- Seules les sessions du dossier ouvert sont préparées. Pour un autre dossier, ouvrez-le puis cliquez de nouveau
- « Sessions préparées : N » signifie que c'est terminé
- Une session en cours d'exécution n'est pas touchée. Si vous voyez « Sessions laissées telles quelles car elles sont en cours d'utilisation », fermez ces sessions puis cliquez de nouveau
- Si toutes vos sessions ont été créées après la v0.36.0, passez cette étape

### 2. Les importer dans Claude Desktop

Dans le menu, choisissez **Aide → Dépannage → Importer les sessions CLI de Claude Code…**.

Une boîte de dialogue demande « Importer N sessions Claude Code ? ». Cliquez sur **Importer les sessions**. Quand l'import est terminé, retrouvez-les dans la liste de l'onglet Code.

- L'import prend **en une fois** toutes les sessions qui ne sont pas encore dans la liste. Inutile de le lancer pour chaque session. Lancez-le de temps en temps, après avoir créé plusieurs sessions dans le plugin
- **Annuler** dans la boîte de dialogue n'importe rien
- Cet emplacement du menu a été vérifié dans l'application de bureau pour macOS. Il peut différer sous Windows et Linux

### 3. Continuer à travailler

Un message envoyé dans une session importée est ajouté au même enregistrement de conversation. Si vous rouvrez cette session dans le plugin, la conversation tenue dans Desktop s'y trouve aussi.

N'exécutez pas une même session aux deux endroits **en même temps**. Deux programmes écriraient dans le même fichier d'enregistrement. Terminez d'un côté, puis poursuivez de l'autre.

## Bon à savoir

- Seules les sessions situées dans des **dossiers approuvés** sont importées. « Aucune session CLI à importer » signifie que les sessions importables figurent déjà dans votre liste, ont été supprimées auparavant ou se trouvent dans des dossiers que Claude n'a pas encore approuvés. Si une session du plugin n'apparaît pas, vérifiez d'abord que vous avez effectué l'étape 1
- Une session que vous avez **supprimée** dans Desktop n'est pas importée de nouveau
- Une session importée conserve son historique et son mode d'autorisation (sauf le mode Contournement des permissions), mais pas son statut d'archivage ni ses autorisations accordées
- Le bouton de l'étape 1 remplace le `sdk-cli` écrit sur chaque ligne du fichier d'enregistrement par le nouveau nom et **ajoute une ligne avec le titre de la session** (le nom que le plugin affiche pour elle) à toute session sans nom choisi avec `/rename`. Sans cette ligne, Desktop nomme une session importée d'après son premier message et affiche la phrase de contexte de l'IDE (par exemple "The user opened the file .env in the IDE") comme titre. Tout le reste est laissé tel quel. Une session créée par un autre outil SDK dans le même dossier est modifiée avec elle
- Nous n'écrivons pas dans les fichiers propres de Desktop pour placer des sessions dans sa liste. Ces fichiers ne sont pas documentés, et une mise à jour de Desktop pourrait casser cela sans prévenir

### Si cela ne fonctionne toujours pas

Dans le même dossier, vous pouvez poursuivre la session avec `claude --resume` dans un terminal.

## Liens associés

### Ticket de ce dépôt

- [#647 — Sessions created in the plugin don't appear in the Claude Desktop Code tab](https://github.com/Swttch/swttch/issues/647)

### Document de ce dépôt

- [Registre d'exception à un principe : `CLAUDE_CODE_ENTRYPOINT` pour l'import de sessions](../../principle-exceptions/647-entrypoint-for-desktop-import.md) — pourquoi cette voie a été choisie et ce qui a été vérifié (en coréen)
