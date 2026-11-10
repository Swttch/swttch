# Avec CCG_HOME défini, les réglages et les comptes enregistrés semblent réinitialisés après la mise à jour

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | **Français**

_Dernière mise à jour : 2026-11-10_

**Cela ne concerne que les personnes qui ont défini elles-mêmes la variable d'environnement `CCG_HOME`.** Si ce n'est pas votre cas, rien ne change pour vous et vous pouvez arrêter votre lecture ici.

Jusqu'à la v0.36.1 incluse, trois types de données ignoraient `CCG_HOME` et restaient dans le dossier par défaut `~/.claude-code-gui`, même si `CCG_HOME` pointait ailleurs. À partir de la version suivant la v0.36.1, ces trois types suivent `CCG_HOME`, comme le reste des données du plugin. Le plugin ouvre donc le dossier désigné par `CCG_HOME`, n'y trouve pas vos anciens fichiers et démarre avec les valeurs par défaut. **Rien n'a été supprimé.** Les anciens fichiers sont toujours dans le dossier par défaut, et les copier comme indiqué ci-dessous règle le problème.

## Symptômes

- Après la mise à jour, vos réglages sont revenus aux valeurs par défaut (thème, taille de police, etc.)
- `swttch account` (ou `ccg account`) indique qu'il n'y a aucun compte enregistré, alors que vous en aviez enregistré
- Tout autre endroit qui affiche les comptes enregistrés est vide

## Savoir si vous êtes concerné

Exécutez ceci dans le terminal depuis lequel vous lancez l'IDE ou le plugin :

| Système | Commande | Vous n'êtes pas concerné si la sortie est |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | vide, ou le même dossier que `~/.claude-code-gui` |
| Windows (PowerShell) | `echo $env:CCG_HOME` | vide, ou le même dossier que `%USERPROFILE%\.claude-code-gui` |
| Windows (cmd) | `echo %CCG_HOME%` | vide (si la variable n'est pas définie, cmd affiche le texte `%CCG_HOME%` tel quel), ou le même dossier que `%USERPROFILE%\.claude-code-gui` |

Si la sortie est un autre dossier, vous êtes concerné.

## Ce qui a changé d'endroit

| Fichier ou dossier (dans l'ancien dossier par défaut) | Contenu |
|---|---|
| `settings.js` | Les réglages du plugin |
| `accounts.json` et le dossier `accounts` | Les comptes Claude enregistrés pour changer rapidement, **avec leurs informations de connexion** |
| `cli-registry` | Une liste temporaire des processus Claude en cours. **Rien à faire**, elle se reconstruit toute seule |

## Comment corriger

Faites-le **avant** de modifier un réglage ou d'enregistrer un compte dans la version mise à jour. La copie écrase ce qui se trouve dans le nouveau dossier (voir « Bon à savoir »).

### 1. Arrêtez le plugin

Fermez l'onglet du plugin dans l'IDE, ou quittez l'IDE. Si vous utilisez la version navigateur, exécutez `swttch stop`.

### 2. Copiez les fichiers dans le dossier désigné par `CCG_HOME`

macOS · Linux :

```bash
mkdir -p "$CCG_HOME"
cp -p ~/.claude-code-gui/settings.js "$CCG_HOME/"
cp -pR ~/.claude-code-gui/accounts.json ~/.claude-code-gui/accounts "$CCG_HOME/"
```

Windows (PowerShell) :

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
Copy-Item "$env:USERPROFILE\.claude-code-gui\settings.js" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts.json" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts" $env:CCG_HOME -Recurse -ErrorAction SilentlyContinue
```

Un message « introuvable » pour un fichier que vous n'avez jamais eu (par exemple si vous n'avez jamais enregistré de compte) est sans conséquence.

### 3. Relancez le plugin

Vos réglages et vos comptes enregistrés sont de retour. `swttch account` les liste.

### 4. Supprimez les anciennes copies (facultatif)

Une fois que vous avez vérifié que tout est revenu, vous pouvez supprimer `settings.js`, `accounts.json` et le dossier `accounts` de `~/.claude-code-gui`. Les fichiers de comptes contiennent des informations de connexion, donc la seule raison de les supprimer est de ne pas laisser de copies en trop. Plus rien n'a besoin des anciennes copies.

## Bon à savoir

- **La copie écrase.** Si vous avez déjà modifié un réglage ou enregistré un compte après la mise à jour, cela se trouve dans le nouveau dossier, et la copie le remplace par l'ancienne version. Dans ce cas, copiez seulement le fichier qui vous manque. S'il ne vous manque qu'un compte, vous pouvez aussi vous reconnecter avec `claude` puis exécuter `swttch account save`
- Vous n'avez pas à changer la valeur de `CCG_HOME`. Seul l'endroit où les données sont lues a changé
- Avec les commandes ci-dessus (`cp -p`), les fichiers gardent leur permission réservée au propriétaire. N'élargissez pas la permission de `accounts.json` ni du dossier `accounts`
- Vos prompts, vos projets et vos fichiers téléversés n'ont jamais été touchés. Ils suivaient déjà `CCG_HOME`

## Liens connexes

### Documents de ce dépôt

- [Bibliothèque de prompts, où sont rangés les prompts](../../features/064-prompt_library/en.md) — décrit comment `CCG_HOME` déplace tout le dossier de données (en anglais)
- [Joindre n'importe quel type de fichier, où sont rangées les copies](../../features/085-attach_any_file_type/en.md) — les copies téléversées suivent aussi `CCG_HOME` (en anglais)
