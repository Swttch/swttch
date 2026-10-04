# Collection

Status: Implemented
Last verified: 2026-10-04 on branch `feat/prompt-library-reorder` (PR #519, not yet merged)

A collection is all the rows of one table: its file and everything that acts on many rows. One collection class per entity class (`PromptItem` and `PromptItemCollection`). The base class is `AbstractEntityCollection`. An entity is one row; reading all rows, finding by `id` and inserting belong to the collection, not to the entity.

## The API

| Call | Does |
|---|---|
| `all()` | Every row as entities. Throws `EntityFileUnreadableError` if the file cannot be read |
| `find(id)`, `where(predicate)` | Read everything, then pick |
| `page(offset, limit, predicate?)` | A window of rows and the total that matched (`EntityPage`) |
| `count(predicate?)` | Without a predicate, the count recorded in `table_metadatas`; otherwise counts matches |
| `insert(entity)` | Gives the row the next id and appends one line |
| `insertMissing(candidates, isSame)` | Appends the candidates no stored row stands for, in one write; the check runs inside the write |
| `save(entity)` | Rewrites the file with the row replaced; answers whether there was such a row |
| `delete(id)` | Rewrites the file without the row; answers whether there was one |
| `mutate(change)` | One atomic read-modify-write over all rows. `save` and `delete` are written on it. A change that must touch many rows at once (shift every row down by one) is written on it too |

## Rules

### Nothing is cached

- **Rule.** Every call reads the file afresh, and every change is one read-modify-write.
- **Why.** Several backends share the files (the IDE plugin, `ccg`, a dev server). A cache would show one of them a state the others have moved on from.

### Ask for a window, not for everything, when a table can grow

- **Rule.** A table that can grow is read with `page(offset, limit)`, not `all()`.
- **Why.** Today a window is cut after the whole file is read, so it saves nothing on disk. Callers written against `page` do not change on the day the storage stops reading everything.

### Appending a row and changing a row are different writes

- **Rule.** `insert` and `insertMissing` append lines and never read the table (the id comes from `table_metadatas`). `save`, `delete` and `mutate` rewrite the whole file through a temporary file and a rename, and drop the lines a later line replaced.
- **Why.** An append costs the same at any size. A rewrite is atomic: a reader sees the old file or the new one, never half of one.

### The id is taken before the write

- **Rule.** `insert` and `insertMissing` get their ids first, then write. Giving the table its first id is also what creates its record in `table_metadatas`.
- **Why.** See [table.md](table.md#rules).

### A table written by a newer layout is not written

- **Rule.** Before it writes, a collection compares the layout version recorded for its table with its own `schemaVersion`. A higher recorded version throws `EntitySchemaTooNewError` and the file is left as it was. Reading is still allowed.
- **Why.** This version does not know what the newer layout means. Adding a row in the layout it knows would leave the file half in one and half in the other.

### Requests wait while migrations run

- **Rule.** `all`, `count`, `insert`, `insertMissing` and `mutate` first ask `MigrationGate.ready()`. While a run is going they wait, and when a run failed they throw `MigrationFailedError`. Code that runs as a migration is let through.
- **Why.** The backend serves as soon as its port is open and the migrations run after that. A request that read during a run would show a half-moved library, which looks like lost data, and a write would bury the old data. Putting the wait in the collection is why no handler has to remember it.
- **Check.** `entities/migration/__tests__/MigrationGate.test.ts`.

## Errors

| Error | When |
|---|---|
| `EntityFileUnreadableError` | The file exists and cannot be read as a file |
| `EntitySchemaTooNewError` | The table's recorded layout is newer than this class knows |
| `MigrationFailedError` | A migration failed in this process, so the entities are held back |

## Hooks for a collection class

- `prepareForWrite(entity)`: called on an entity before it is written. It may settle a value (the spelling of a path) and may throw to refuse. `ProjectCollection` uses it to refuse a project with a `projectId` and to settle the path.
- `hydrate(row)`: build the entity from a checked row.

## Limits

- `where` and `find` read the whole file. See the limits in [table.md](table.md#limits).
- A `mutate` callback is synchronous. It must not await.
