# Entity

Status: Implemented
Last verified: 2026-10-04 on branch `feat/prompt-library-reorder` (PR #519, not yet merged)

An entity is one row of one table, as a class that extends `AbstractEntity`. This document covers what an entity is made of, how a row points at a project, and how to add or change one.

## Rules

### Rows are classes

- **Rule.** The app never holds a row as a plain object or an interface. JSON becomes an instance on the way in (`RawRow.parse`, then `hydrate`) and an instance becomes JSON on the way out (`toJSON`). Nothing in between keeps the plain object.
- **Why.** A plain object has no behavior and no name. Classes keep the rules of a row next to the row.
- **Check.** Review. A search for an interface that stands for a row is the quickest.

### Five column types

- **Rule.** A column is `int`, `nullable-int`, `number`, `string` or `nullable-string` (`Column.ts`). Timestamps are `number` in epoch milliseconds. There is no boolean: use a number (`favoritedAt`, `hiddenAt`: 0 means "not").
- **Why.** Rows are plain JSON, and these are what a check can verify.
- **Check.** `RawRow.parse` rejects a value that a column does not accept; the row is then kept aside, not loaded.

### Every row has `id` and `projectId`

- **Rule.** The shared columns are `id` (a whole number from 1, assigned on insert, never changed) and `projectId` (a number or `null`).
- **Meaning of `projectId`.** The number of the project, a row of `projects`, that this row belongs to. `null` means it belongs to no project and is shared by all of them. A row of `projects` itself always has `null`, and `ProjectCollection` refuses anything else.
- **Why a number.** The directory is the project's own business. If a project moves, one row changes and everything that points at it follows.
- **Check.** `project/__tests__/Project.test.ts`.

### A project is named by its path everywhere outside the entity files

- **Rule.** Messages, the CLI, the webview and feature code speak of a project by its path. Inside the entity files it is a number. A path becomes a number in one place: `ProjectCollection.idOf(path)` (a directory seen for the first time is registered on the spot), and back with `pathOf(id)`. A feature resolves it once at the edge of a request (see `resolveScopeProject` in `features/prompts.ts`) and passes the number on.
- **Why.** The CLI and the webview already work with paths, and the CLI's own records are keyed by them. The number is storage's business.
- **Violation.** Storing a path in a column of another table; comparing paths inside a `where` predicate.

### One spelling of a path

- **Rule.** `normalizeCwd` (`project/normalizeCwd.ts`) settles the spelling: absolute only, `..` and doubled or trailing separators removed, links followed, the on-disk case used on a case-insensitive file system, drive letter upper-case on Windows. A directory that no longer exists keeps its resolved spelling. A path that is absolute on another platform (a Windows path in a transcript read on macOS) is kept as written. `ProjectCollection` applies it when it writes a project.
- **Why.** Two spellings of one folder would split a project's rows in two.

## Anatomy of an entity class

```ts
export class PromptItem extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity['columnsWith'](new Column('uuid', 'string'), /* ... */);
  constructor(id: number, projectId: number | null, public uuid: string, /* ... */) { super(id, projectId); }
  static draft(projectId: number | null, /* ... */): PromptItem { return new PromptItem(0, projectId, /* ... */); }
  static fromRow(row: RawRow): PromptItem { /* one typed accessor per column */ }
  get columns() { return PromptItem.COLUMNS; }
  toJSON() { return { id: this.id, projectId: this.projectId, /* every column */ }; }
}
```

A row that has not been inserted has `id` 0 (`isInserted` is false). `assignId` refuses to number a row twice.

## Decisions

### `projectId` is a foreign key, and `Project` points at no project

- **Decision.** The shared column is `projectId: number | null`. It replaces the earlier `cwd` string.
- **Why.** See "Why a number" above. A project row carrying the same column keeps the base class single; the column means "the project this row belongs to", so it is `null` for the project itself. A project that sits under another project could use this column later; it is not used that way now.

## Recipes

### Add an entity

1. Entity class and collection class in the domain folder (`entities/<domain>/`). Names: `<Name>.entity.ts`, `<Name>.collection.ts`.
2. List the table in [catalog.md](catalog.md). See also [table.md](table.md).
3. If the entity replaces data of an older version, write a migration ([migration.md](migration.md)).

### Add a column

1. Add the `Column`, the constructor parameter, `fromRow`, `draft` and `toJSON`.
2. Rows already on disk lack the new column, so `RawRow.parse` will reject them. Either give old rows the value in a migration that rewrites the table, or read the column leniently like `projectId`. Raise `schemaVersion` with the migration.

### Change a column's meaning, name or type

1. Write a migration that rewrites the table, and raise `schemaVersion` in the collection class in the same change. A copy of the old file is not made for you: a migration that changes a file in place should write `<file>.bak-<migration name>` first.
