# Entity system (backend/src/core/entities)

This folder holds the entity system: a small ORM-like layer that stores rows in files under `~/.claude-code-gui/entities/` and hands them to the app as classes. These documents describe the system itself. Facts about one particular entity (what its columns mean, how a feature uses it) live in the entity class comments and in the feature documents, not here.

Every document under `docs/` states its own status in its first lines. Run `rg '^Status:' docs/` to see which parts are built and which are only planned. Read the `Status:` line before trusting a statement as a description of the current code.

## What you want to do, and what to read

| What you want to do | Read |
|---|---|
| Understand what the system is, why it is not a SQL engine, and how its parts fit together | [docs/overview.md](docs/overview.md) |
| Name a table, understand the file format, ids, the table metadata or `schemaVersion` | [docs/table.md](docs/table.md) |
| Add or change an entity class or a column, or understand `projectId` | [docs/entity.md](docs/entity.md) |
| Read, insert, save, delete, or page through rows | [docs/collection.md](docs/collection.md) |
| Move old data into the entity system, change the shape of an existing table, or write a migration | [docs/migration.md](docs/migration.md) |
| Find which tables exist | [docs/catalog.md](docs/catalog.md) |

## Rules that apply to every task

1. Rows are classes. A plain object exists only at the input/output boundary (`RawRow` on the way in, `toJSON` on the way out). Do not add interfaces or plain objects that stand for a row.
2. Every table is JSONL: one JSON object per line, and the later line wins for the same `id`. Do not write a table as one JSON array.
3. A table name is a plural snake_case noun with no prefix. A domain prefix is added only to a generic noun (`items`, `categories`) that could collide across domains. Tables that run the machinery itself live in `system/`.
4. A row points at its project by `projectId` (a row of `projects`), never by a path. Outside the entity files a project is named by its path, and `ProjectCollection.idOf` is the one place a path becomes a number.
5. An id is never reused. It is handed out by `table_metadatas` before the row is written.
6. Never read or write an entity file with a path of your own. Go through its collection, which is what holds back requests while migrations run.
7. Data from an older version is moved by a migration in `core/migrations/`, which never deletes its source file. Do not move data lazily from a request handler.
8. Do not shell out for file work. Use Node `fs`.
9. Do not describe a plan as if it were built. When code lands, update the `Status:` and `Last verified:` lines of the document that covers it in the same change.
