# Migration

Status: Implemented
Last verified: 2026-10-04 on branch `feat/prompt-library-reorder` (PR #519, not yet merged). Checked against the bundled backend and the dev (`tsx`) backend booted on a throwaway home with old data planted, and on a copy of real old data (about 0.5 s, 30 projects). Checked in a browser through the dev webview, on Linux, Windows 11 and WSL. The re-reading of unread folders is checked with the bundled backend at its three moments (window active again, the prompts opened, the backend restarted). Not yet checked in a real IDE.

A migration moves the user's data from the shape an older version wrote to the shape this version reads. The migration system runs them when the backend starts.

## How it works

- A migration is a file in `backend/src/core/migrations/`, named `<14-digit timestamp>_<kebab-name>.ts`, exporting by default one class that extends `Migration` and implements `async up(context)`. It returns a `MigrationReport` (a sentence for a person, and the folders whose old files could not be read).
- `migrations/registry.ts` lists them in order. The backend is one bundle, so the folder cannot be read at run time. A test (`migrations/__tests__/registry.test.ts`) compares the list with the folder, so a file nobody listed fails the build instead of never running. `MigrationRegistry` checks the names: the right shape, unique, in timestamp order.
- `system_migrations` records each migration that finished: name, app version, when, how long, and its summary. **The migrations due are the names in the registry that have no record.** There is no version comparison. A user who skipped versions is brought forward through every migration they lack, in order, and a migration with an earlier name than a recorded one is still run.
- `MigrationRunner` runs the due ones one after the other, each finished before the next begins. The first one that throws stops the run: it is not recorded, the ones after it do not run, and it is tried again with everything after it, at the next start or when the user asks (see "A failed run is tried again in the same process"). A run does not throw; the failure is in its result (`MigrationRunResult`).
- Names recorded by a newer version are left alone and mentioned in the log (a user who went back to an older build).
- There is no `down`. The source of a move is left where it is, so an older version finds it as it was.

### Start-up (`server.ts`)

1. `StartupMigrations` closes the gate (`MigrationGate`) as it is created, **before** the server accepts a message.
2. The server opens its port.
3. `startupMigrations.start()` runs the migrations. Starting after the port is open keeps a long migration from eating the time whoever started the backend waits for the port.
4. While it runs, `all`/`count`/`insert`/`insertMissing`/`mutate` of every collection wait; a failed run makes them throw `MigrationFailedError`. Code a migration runs is let through (the tag follows its `await`s).

### Several processes at once

The IDE, `ccg` and a dev server share the data directory and all find the same migrations due after an update. `MigrationLock` is a lock file made with the exclusive flag (`entities/.migrations.lock`). The holder touches it every two seconds. A lock not touched for 30 seconds, or whose process no longer exists, is taken over. The run looks at the records again once it has the lock, so what another process finished is not done twice. A process that cannot get the lock within five minutes fails the run with `(lock)` and tries again at its next start, or when the user asks.

### What the user sees

`MigrationStatus` (`features/migration-status.ts`) turns progress into `MIGRATION_STATUS` messages, pushed to every window and answered to `GET_MIGRATION_STATUS`:

- A run that finishes within a second shows nothing.
- A run still going after a second shows "updating your data".
- A failure always shows, with the failed migration's name, and a "Try again" button at the end of the notice. The library and the project list answer with an error, not an empty list.
- A finished run that could not read some old files shows the folders and how to fix it.

The webview side is `useMigrationStatus` and `MigrationBanner` in the chat page.

## Rules

### A migration never deletes its source

- **Rule.** Old files are read, never written, renamed or deleted.
- **Why.** They are the backup. Going back to an older version finds them as they were.
- **Check.** Every import test hashes the old file before and after.

### A migration can be run again from the start

- **Rule.** Everything a migration writes is safe to write twice: add a row only if none stands for it. A migration that is cut off leaves no record and runs again.
- **Check.** "adds no row twice when it runs again" and "changes nothing when it runs again" in the import tests.

### A file that cannot be read does not stop the migration

- **Rule.** A file that is not JSON, or cannot be read for lack of permission, is reported in `MigrationReport.unreadable` and skipped. Stopping would hold every entity back for good over one damaged file.
- **Why.** The run stops at the first failure, and a failure holds back all entities. A failure should mean "something is wrong that retrying can fix".
- **Then.** The folder is kept in `unread_folders` and read again by the program itself (see below). The migration is recorded as done all the same.

### Every migration passes the same tests

- An import: a fixture of the old file, "twice gives the same result", "cut off half way and run again gives the same result", "the old file's hash did not change".
- A migration that is added is listed in `registry.ts`.

## A failed run is tried again in the same process

Nothing says that the cause of a failure is gone (a file another program held, a disk that was full), so there is no moment to wait for as there is for unread folders. The way out is a try the user can start, plus one the program starts when the user is looking:

- **The button.** The failure notice has a "Try again" button. It sends `RETRY_MIGRATIONS`; the backend runs the migrations again in the process that is running (`StartupMigrations.retry`), closes the gate again behind it (`MigrationGate.closeAgain`) so requests wait instead of failing, and answers when the run is over. Nothing is restarted.
- **Coming back to the window.** While a run is failed, the webview sends the same message when the window becomes active, at most once every 15 seconds (`useMigrationRetry`). Whoever freed the disk or closed the other program is looking at the window at that moment.
- **The outcome.** It reaches every window through the migration status. A run that works clears the failure notice, however quick it was. A run that fails again leaves it, and the button can be pressed once more.
- **Safe to repeat.** The migrations are safe to run again from the start, so a try never loses or doubles anything. Calls that come at the same moment share one run, and a try when no run failed does nothing.

## Unread folders are read again by themselves

A migration that cannot read an old file is still recorded as done, so nothing would look at that folder again. `unread_folders` (`UnreadFolder`) keeps one row per folder and the migration that could not read it. `MigrationRunner` writes the rows before it records the migration, and `UnreadFolderRetry` works the list down.

- **When it reads again, with nothing asked of the user.**
  1. The backend starts (before the due migrations run), so a restart or a reopened IDE finds the data moved.
  2. The user opens the prompts of a project, or the shared library: only that folder is read again, and the prompts are answered with what it held.
  3. The window becomes active again while folders are unread, which is the moment after allowing access in the system settings. The webview sends `RETRY_UNREAD_FOLDERS`, at most once every five seconds.
- **How.** `Migration.retry(context, folders)` reads the folders again and answers the ones still unread. A migration that reports unreadable folders overrides it. `ImportLegacyPrompts.retry` moves what reads now, the shared file first, and puts the moved prompts below the ones the user has made in that project meanwhile.
- **What the user sees.** The notice names the unread folders and says access can be allowed in the system settings. It goes away by itself once the folders are read (`MigrationStatus.unreadFolders`). It never says to restart, because the program does the reading.
- **Safe to repeat.** The passes take turns inside the process and hold the same lock as the migrations, so two backends do not move one folder at once. A row is deleted only after its folder was read and written. A folder whose file is gone, or whose project is no longer known, is let go.
- **Not a failure.** Reading a folder that still cannot be read is the normal case. It is not logged as an error to the user and does not hold any entity back.

## Legacy import template

`LegacyImport<S>` (`migration/LegacyImport.ts`) is for moving data out of a file an older version kept: **read** the old store (null when there is none), **write** the rows only if none stands for them, **verify** by reading back and counting (a mismatch throws, so the migration is not recorded). The runner records it after that. `ImportCounts` carries what was written, what was skipped, and the folders that could not be read.

## The current migrations

| Migration | Does |
|---|---|
| `20261004120000_create-projects` | Registers every directory the CLI has sessions in as a project (`syncProjectsList`) |
| `20261004120100_import-legacy-projects-json` | Moves pins, aliases and notes from `~/.claude-code-gui/projects.json` onto the projects. A project it names that the table lacks is registered, so a pin on a directory with no session is kept. Never overwrites what a project already has |
| `20261004120200_import-legacy-prompts` | Moves `~/.claude-code-gui/prompts.json` and the `.claude-code-gui/prompts.json` inside every known project. The shared file goes first |

## Decisions

### Files in a folder, one `up`, a record of names

- **Decision.** The model of common ORMs: a file per migration with a timestamp prefix, a record of what has run, the unrecorded run in order.
- **Why.** Anyone who has used a migration tool reads it at once. The set difference needs no version comparison, which is also why it is right in development, where a worktree and a release share a version string.
- **Not chosen.** A dependency graph between migrations, a fingerprint of the registry, a `down` step.

### Project data is found through the `projects` table, not by walking the home folder

- **Decision.** An import that looks inside every project visits the projects the table holds.
- **Why.** The table holds every directory the CLI has sessions in and every directory the program was asked about. A walk of the home folder was slow, needed a list of folders to skip, and on macOS could put a permission dialog in front of the user for `Desktop`, `Documents` and `Downloads`.
- **Cost.** Old project prompts in a directory that never had a session and was never opened with this program are not found. They stay in the old file.

### Failure stops the run and holds the entities back

- **Decision.** The first failure stops the run, and every entity request fails until a later run works: the next start, or a try in the same process.
- **Why.** The migrations after the failed one may depend on it. Showing a library that is half moved looks like lost data.
- **Revisit when.** A migration exists that is independent of the rest and a user can be hurt by it holding everything back.

## Limits

- Old prompts of a project that was never registered are not moved (see above).
- A migration that cannot get the lock within five minutes fails the run and is tried again at the next start, or when the user asks.
- Linux (Debian, Node 22, as a normal user) passes the whole backend suite and both boot scenarios. Windows 11 (Node 24) passes the whole backend suite (3174 passed, 36 skipped, none failed) and both boot scenarios with the bundled backend. What is guarded for it: a lock file or a line that Windows refuses for a moment (`EPERM`, `EACCES`, `EBUSY`) is retried (`retryTransient`), a POSIX path is not given a drive letter, and tests that need symbolic links or `chmod` are skipped where those are not allowed (on that machine only the two `chmod` tests and the "not Windows" test were skipped). Not covered: a real IDE on Windows, WSL projects, and an antivirus that holds a file for longer than the retries wait.

## Recipe: write a migration

1. Make the file `backend/src/core/migrations/<timestamp>_<what-it-does>.ts`. The timestamp is after every existing one.
2. Extend `Migration` (or `LegacyImport` for a move out of an old file). Return a summary a person can read.
3. List it at the end of `registry.ts`.
4. If it changes the shape of a table in place, write `<file>.bak-<migration name>` first, and raise the collection's `schemaVersion` in the same change.
5. Write its tests: twice gives the same result, cut off half way gives the same result, the source's hash is unchanged.
