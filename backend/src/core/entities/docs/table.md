# Table

Status: Implemented
Last verified: 2026-10-04 on branch `feat/prompt-library-reorder` (PR #519, not yet merged)

A table is one file: `~/.claude-code-gui/entities/<domain>/<table>.entity.jsonl` (the root follows `CCG_HOME`). This document covers the file, its naming, and the record the program keeps about each table (`table_metadatas`).

## Rules

### The file is JSONL

- **Rule.** One JSON object per line. Of two lines with the same `id`, the later one is the row. A line `{"id":N,"deleted":true}` removes row N. Rows come back in the order their `id` first appeared. Blank lines are skipped, and a `\r` before the line break is not part of the line.
- **Why.** Adding a row is appending one line, which costs the same at any size. A reader can stop early. A line that is damaged costs that line and nothing else.
- **Check.** `entities/__tests__/entities.test.ts` ("which line is the row"), `storage/__tests__/JsonlFile.test.ts`.
- **Violation.** Writing a table as one JSON array; relying on the position of a line instead of its `id`.

### A line that is not JSON is kept, not dropped

- **Rule.** A complete line that does not parse, and a last line cut short by a process that died, are set aside. The next rewrite writes them back unchanged (after the rows). The next append starts on a fresh line and does not glue onto a cut line. A value that parses but is not a row of this table is kept the same way.
- **Why.** Reading must not quietly edit a store. A hand edit, or a row from a newer version, has to survive our next write.
- **Check.** `entities.test.ts` ("a line that is not JSON", "rows that fail the column check").
- **Note.** Rejected lines are written back after the rows, not at their original position, because a rewrite also drops the lines that a later line replaced.

### A file that cannot be read is never treated as empty

- **Rule.** A path that exists but cannot be read as a file (a folder, no permission) throws `EntityFileUnreadableError`. It never answers "no rows", and a write refuses.
- **Why.** An empty answer looks like every row was lost, and the next write would replace the file with it.
- **Check.** `entities.test.ts` ("a file that cannot be read").

### Naming

- **Rule.** A table name is a plural snake_case noun, with no prefix by default. A domain prefix is added only to a generic noun that could collide across domains (`prompt_items`, `prompt_categories`). The folder is the domain. Tables that run the machinery itself are in `system/` (`table_metadatas`). `system_migrations` is an existing name and an exception.
- **Why.** The prefix exists to group tables of one domain ahead of a collision, not to decorate every name.
- **Check.** The `table` comment in `AbstractEntityCollection.ts`; `entities.test.ts` ("where each table lives").

### Ids are never reused

- **Rule.** An id is a whole number from 1. The id is taken from `table_metadatas` before the row is written. A failure between the two costs a number, never gives a number twice.
- **Why.** Anything that still points at a deleted row (a link, a row of another project) would otherwise point at a stranger.
- **Check.** `entities.test.ts` ("never gives out an id again", "counts the id of a deleted row"), `system/__tests__/TableMetadata.test.ts`.

## `table_metadatas`

`entities/system/table_metadatas.entity.jsonl`, class `TableMetadata`, collection `TableMetadataCollection`. One row per table, created the first time that table is given an id.

| Column | Meaning |
|---|---|
| `tableName`, `domain` | Which table |
| `lastId` | The highest id handed out. Never goes down. The only value that must be right |
| `rowCount`, `lineCount` | Rows alive, and lines in the file. Hints, put right whenever the whole file is read |
| `schemaVersion` | The version of the column layout the file was written in |
| `createdAt`, `updatedAt` | Epoch milliseconds |

- Giving a row an id does not read the table once the table has a record, so the cost of a new row does not grow with the table. The first time a table is numbered the file is looked at once, to take its highest id and its counts (this is what keeps a table filled by hand, or before this record existed, from being given a taken number).
- A row planted behind the program's back is seen the next time the whole file is read, which raises `lastId` to it.
- `table_metadatas` numbers its own rows one above the highest, with no record of its own.

### `schemaVersion`

Each collection class declares the version of the layout it writes (starting at 1). A table whose recorded version is higher than the class knows is not written (`EntitySchemaTooNewError`); it can still be read. A change that alters the columns raises the version in the same migration that changes the data.

## Decisions

### JSONL for every table (not a JSON array, not CSV)

- **Decision.** Every table is JSONL.
- **Options.** One JSON array per table (what existed): reads and writes the whole file for every row. CSV: no `null` versus empty string, no distinction between a number and numeric text, and a cell with a line break breaks "one line, one row" (a prompt's content has line breaks).
- **Why.** JSONL keeps the types the columns declare, escapes line breaks inside a row, and keeps the file readable with `grep` and `jq`.
- **Revisit when.** A table needs lookups by something other than `id` at a size where reading the file is too slow. An index file can be added without changing the format.

### Later line wins, and a deletion is a line

- **Decision.** The format already says that a later line replaces an earlier one and that a deletion line removes a row, although the first implementation still rewrites the file for a change or a delete.
- **Why.** The rule for reading is part of the format. Fixing it now means a later version can change a row by appending a line, without a format change, and an older version can still read the file.

### `table_metadatas` replaces `system_sequences`

- **Decision.** One table of per-table facts, not a table of counters only. Ids, counts and layout version live together.
- **Why.** The old counter read the whole table to find its highest id on every insert. A table that also records its layout version is what lets an old build refuse to write a table a newer build changed.

## Limits

- Finding a row by `id` reads the file from the start. At tens of thousands of rows this will need an index file.
- `rowCount` and `lineCount` can be off for a moment when another process is writing. Do not use them for a decision that must be exact.

## Recipe: add a table

1. Write the entity class and the collection class (see [entity.md](entity.md)). Give the collection a `domain`, a `table`, its `columns` and `schemaVersion = 1`.
2. Take ids from `defaultTableMetadata()` in the constructor.
3. Add the table to [catalog.md](catalog.md).
