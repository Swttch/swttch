# Avec CCG_HOME défini, les comptes enregistrés, la licence et d'autres données semblent réinitialisés après la mise à jour

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | **Français**

_Dernière mise à jour : 2026-11-10_

**Cela ne concerne que les personnes qui ont défini elles-mêmes la variable d'environnement `CCG_HOME`.** Si ce n'est pas votre cas, rien ne change pour vous et vous pouvez arrêter votre lecture ici.

Jusqu'à la v0.36.1 incluse, plusieurs types de données ignoraient `CCG_HOME` et restaient dans le dossier par défaut `~/.claude-code-gui`, même si `CCG_HOME` pointait ailleurs. À partir de la version suivant la v0.36.1, ils suivent `CCG_HOME`, comme le faisaient déjà vos prompts, vos projets et vos fichiers téléversés. Le plugin ouvre donc le dossier désigné par `CCG_HOME`, n'y trouve pas vos anciens fichiers et repart de zéro. **Rien n'a été supprimé.** Les anciens fichiers sont toujours dans le dossier par défaut, et les copier comme indiqué ci-dessous règle le problème.

## Symptômes

- `swttch account` (ou `ccg account`) indique qu'il n'y a aucun compte enregistré, alors que vous en aviez enregistré
- Les fonctions réservées aux sponsors sont désactivées, comme si vous n'aviez pas de clé de licence
- La question sur l'envoi de données d'utilisation anonymes réapparaît, comme si vous n'y aviez jamais répondu
- Les messages que vous aviez programmés ont disparu de la liste

## Savoir si vous êtes concerné

Exécutez ceci dans le terminal depuis lequel vous lancez l'IDE ou le plugin :

| Système | Commande | Vous n'êtes pas concerné si la sortie est |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | vide, ou le même dossier que `~/.claude-code-gui` |
| Windows (PowerShell) | `echo $env:CCG_HOME` | vide, ou le même dossier que `%USERPROFILE%\.claude-code-gui` |
| Windows (cmd) | `echo %CCG_HOME%` | vide (si la variable n'est pas définie, cmd affiche le texte `%CCG_HOME%` tel quel), ou le même dossier que `%USERPROFILE%\.claude-code-gui` |

Si la sortie est un autre dossier, vous êtes concerné.

## Ce qui a changé d'endroit

| Fichier ou dossier (dans l'ancien dossier par défaut) | Contenu | Que faire |
|---|---|---|
| `accounts.json` et le dossier `accounts` | Les comptes Claude enregistrés pour changer rapidement, **avec leurs informations de connexion** | Copier |
| `license.json` | Votre clé de licence de sponsor | Copier |
| `profile.json` | Votre réponse sur les données d'utilisation anonymes et l'identifiant aléatoire de cette installation | Copier |
| `scheduled-messages.json` | Les messages que vous avez programmés | Copier |
| Dossier `workflow-agents` | Les noms d'agents qu'un workflow terminé affiche quand vous rouvrez un chat | Copier si vous voulez les garder |
| Dossiers `account-pool-recovery` et `cli-registry`, `logs/lifecycle.log`, dossier `bin` | Des notes de courte durée, la liste des processus Claude en cours, un journal de démarrage, l'outil de tunnel téléchargé | Rien, ils sont recréés ou retéléchargés tout seuls |

## Ce qui n'a pas changé d'endroit

- **`settings.js`** (les réglages du plugin) reste volontairement dans le dossier par défaut. Le plugin de l'IDE lit et écrit le même fichier et ne connaît pas `CCG_HOME`, donc les deux côtés doivent continuer à l'utiliser. Vos réglages ne sont pas réinitialisés par ce changement
- **`auth-secret`**, le secret qui protège la connexion entre la page du chat et son backend, reste aussi, pour la même raison : la commande `swttch` et le plugin de l'IDE le partagent
- Vos prompts, projets, fichiers téléversés, fichiers envoyés et chiffres d'utilisation suivaient déjà `CCG_HOME` et ne sont pas concernés

## Comment corriger

Faites-le **avant** d'enregistrer un compte, de saisir une licence ou de modifier quoi que ce soit dans la version mise à jour. La copie écrase ce qui se trouve dans le nouveau dossier (voir « Bon à savoir »).

### 1. Arrêtez le plugin

Fermez l'onglet du plugin dans l'IDE, ou quittez l'IDE. Si vous utilisez la version navigateur, exécutez `swttch stop`.

### 2. Copiez les fichiers dans le dossier désigné par `CCG_HOME`

macOS · Linux :

```bash
mkdir -p "$CCG_HOME"
for f in accounts.json accounts license.json profile.json scheduled-messages.json workflow-agents; do
  [ -e ~/.claude-code-gui/$f ] && cp -pR ~/.claude-code-gui/$f "$CCG_HOME/"
done
```

Windows (PowerShell) :

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
foreach ($f in 'accounts.json','accounts','license.json','profile.json','scheduled-messages.json','workflow-agents') {
  $src = Join-Path $env:USERPROFILE ".claude-code-gui\$f"
  if (Test-Path $src) { Copy-Item $src $env:CCG_HOME -Recurse -Force }
}
```

Un fichier que vous n'avez jamais eu (par exemple si vous n'avez jamais programmé de message) est simplement ignoré.

### 3. Relancez le plugin

Vos comptes enregistrés, la licence, la réponse sur les données d'utilisation et les messages programmés sont de retour. `swttch account` liste les comptes.

### 4. Supprimez les anciennes copies (facultatif)

Une fois que vous avez vérifié que tout est revenu, vous pouvez supprimer de `~/.claude-code-gui` les fichiers copiés. Gardez `settings.js` et `auth-secret`, qui y sont toujours utilisés. `accounts.json`, le dossier `accounts` et `license.json` contiennent des informations de connexion et votre clé de licence, donc la seule raison de les supprimer est de ne pas laisser de copies en trop. Plus rien n'a besoin des anciennes copies.

## Bon à savoir

- **La copie écrase.** Si vous avez déjà enregistré un compte, saisi une licence ou répondu à la question sur les données d'utilisation après la mise à jour, cela se trouve dans le nouveau dossier, et la copie le remplace par l'ancienne version. Dans ce cas, copiez seulement l'élément qui vous manque. S'il ne vous manque qu'un compte, vous pouvez aussi vous reconnecter avec `claude` puis exécuter `swttch account save`. Une clé de licence perdue peut être saisie de nouveau
- Vous n'avez pas à changer la valeur de `CCG_HOME`. Seul l'endroit où les données sont lues a changé
- Avec les commandes ci-dessus (`cp -p`), les fichiers gardent leur permission réservée au propriétaire. N'élargissez pas la permission de `accounts.json`, du dossier `accounts` ni de `license.json`

## Liens connexes

### Documents de ce dépôt

- [Bibliothèque de prompts, où sont rangés les prompts](../../features/064-prompt_library/en.md) — décrit comment `CCG_HOME` déplace tout le dossier de données (en anglais)
- [Joindre n'importe quel type de fichier, où sont rangées les copies](../../features/085-attach_any_file_type/en.md) — les copies téléversées suivent aussi `CCG_HOME` (en anglais)
