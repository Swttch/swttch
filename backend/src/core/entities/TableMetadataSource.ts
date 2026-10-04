/** Who a table is, as far as the numbering and version bookkeeping is concerned. */
export class TableIdentity {
  constructor(
    /** The table's name, e.g. `prompt_items`. */
    readonly table: string,
    /** The folder under the entities root the table's file sits in, e.g. `prompt`. */
    readonly domain: string,
    /** The version of the column layout the running code writes. */
    readonly schemaVersion: number,
  ) {}
}

/** How many rows and lines a table's file holds. */
export class TableCounts {
  constructor(
    /** Rows that are alive: not deleted, and not replaced by a later line. */
    readonly rowCount: number,
    /** Every line of the file, including the ones a later line has replaced. */
    readonly lineCount: number,
  ) {}
}

/** What a first look at a table's file found. */
export class TableLook {
  constructor(
    /** The highest `id` any line of the file mentions, rows replaced or deleted included. 0 for an empty file. */
    readonly highestId: number,
    readonly counts: TableCounts,
  ) {}
}

/**
 * What a collection needs to know about its table that does not live in the
 * table: the numbers handed out so far, the version of the layout the file was
 * written in, and a count of its rows.
 *
 * An abstract class of its own so the collections that need these facts do not
 * depend on the collection that stores them: `table_metadatas` is itself a
 * collection.
 */
export abstract class TableMetadataSource {
  /**
   * The next number for a table, greater than every number handed out before. With
   * a [count] above one it hands out a block at once and answers the LAST number of
   * it: the block is `answer - count + 1` up to `answer`.
   *
   * [firstLook] is asked for only the first time a table is numbered here, and
   * answers what its file holds already. It is what keeps a table that was filled
   * before this record existed (or by hand) from being given a number that is
   * taken, and what gives the new record true counts. Once the table has a record,
   * numbering never reads the table, so the cost of a new row does not grow with the
   * rows it already has.
   */
  abstract allocate(identity: TableIdentity, count: number, firstLook: () => Promise<TableLook>): Promise<number>;

  /** The version of the layout the table's file was written in, or null if the table has no record. */
  abstract schemaVersionOf(table: string): Promise<number | null>;

  /** The counts last recorded for a table, or null if it has no record. These are hints. */
  abstract countsOf(table: string): Promise<TableCounts | null>;

  /** Move the recorded counts by [rows] and [lines]. Does nothing for a table with no record. */
  abstract adjustCounts(table: string, rows: number, lines: number): Promise<void>;

  /**
   * Replace the recorded counts with what was just seen or written, and raise the
   * last number handed out to [maxId] if the file holds a higher one. Writes only
   * when something differs. Does nothing for a table with no record.
   */
  abstract settle(table: string, counts: TableCounts, maxId: number): Promise<void>;
}
