# Overview

Status: Implemented
Last verified: 2026-10-04 on branch `feat/prompt-library-reorder` (PR #519, not yet merged)

## What the entity system is

A small ORM-like layer. A table is one file of rows under `~/.claude-code-gui/entities/<domain>/`. A row is an instance of an entity class. A collection class is the set of rows of one table and is the only way to read or write them.

The parts, from the disk upward:

| Part | Where | Job |
|---|---|---|
| File | `storage/JsonlFile.ts` | Lines of JSON: read, append, rewrite. Knows nothing about rows |
| Collection | `AbstractEntityCollection.ts` | Which line is a row, ids, version guard, paging, the gate |
| Entity | `AbstractEntity.ts`, `Column.ts` | One row as a class; the five column types; the shared `id` and `projectId` |
| Table metadata | `system/TableMetadata.*` | Last id, counts and layout version of every table |
| Projects | `project/Project.*` | The one place a directory becomes a number |
| Migrations | `migration/`, `../migrations/` | Moving the data of an older version into this system |

Details of each part are in [table.md](table.md), [entity.md](entity.md), [collection.md](collection.md) and [migration.md](migration.md).

## Decisions that apply to the whole system

### Files, not a SQL engine (for now)

- **Decision.** Tables stay JSONL files. No SQL engine is attached.
- **Why.** The data is small and per-user. The needs that a SQL engine would answer (foreign keys, joins) are small enough to be done in the collection layer. The engine candidates each carry a cost that is not worth paying yet:
  - `node:sqlite` is built into Node 22.5 and later. This program uses the Node the user has installed (nvm, volta, system), and no minimum Node version is enforced, so it may not exist. Its documentation still marks it as a release candidate.
  - `better-sqlite3` is a native add-on, so a binary per platform and per Node ABI has to be shipped.
  - `node-sqlite3-wasm` needs no native binary and has foreign keys on by default, but it is pre-1.0 (0.8.x) and its maturity, speed and behavior with several processes on one file are unmeasured.
  - WASM builds that keep the database in memory lose the one thing SQLite would give: a file several processes can use.
  - File-based JS databases (lowdb, NeDB, LokiJS) give less than the layer already has: lowdb lets the last writer overwrite the other process, NeDB is no longer maintained.
- **Revisit when.** A feature needs a foreign key or a join that is no longer cheap to do in memory. Then prototype `node-sqlite3-wasm` first and measure: Node requirement, speed at this data size, and whether two processes opening one file can corrupt it.

### JSONL for every table

See [table.md](table.md#decisions). One line per row makes adding a row cost the same at any size, lets a read stop early, and confines damage to the line that is damaged.

### Cost of one JSON array per table (measured)

On one Mac, rows of about 360 bytes, median of five runs. Lock and fsync of the atomic write are not included.

| Rows | File | Read and parse | Add one row (read, parse, stringify, write) |
|---|---|---|---|
| 5,000 | 1.79 MB | 5.6 ms | 7.9 ms |
| 50,000 | 18.13 MB | 36.1 ms | 91.3 ms |

Adding a row to a JSON array rewrites the whole file, so a table that is added to often becomes the problem long before a table that is only read. This is why every table is lines and adding a row appends one. Times on Windows and Linux were not measured.

### Migrations move data; handlers do not

Data of an older version is moved once, at start-up, by migrations that run before any request touches an entity. See [migration.md](migration.md).

## Reading order for a new task

1. [table.md](table.md) for the file and its rules.
2. [entity.md](entity.md) if you add or change a class.
3. [collection.md](collection.md) for how to read and write.
4. [migration.md](migration.md) if existing user data has to change shape.
