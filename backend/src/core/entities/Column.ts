/**
 * What a column can hold. Row files are plain JSON, so these five are all there
 * is: a whole number, any finite number (timestamps), a string, and a string or a
 * whole number that may be absent.
 */
export type ColumnType = 'int' | 'nullable-int' | 'number' | 'string' | 'nullable-string';

/** One column of a table: its name and what it may hold. */
export class Column {
  constructor(
    readonly name: string,
    readonly type: ColumnType,
  ) {}

  accepts(value: unknown): boolean {
    switch (this.type) {
      case 'int':
        return typeof value === 'number' && Number.isInteger(value);
      case 'nullable-int':
        return value === null || (typeof value === 'number' && Number.isInteger(value));
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'string':
        return typeof value === 'string';
      case 'nullable-string':
        return value === null || typeof value === 'string';
    }
  }
}

/** The columns every table has. */
export const BASE_COLUMNS: readonly Column[] = [
  new Column('id', 'int'),
  new Column('projectId', 'nullable-int'),
];

/**
 * One row of a file that has passed the column check, and nothing else.
 *
 * The only place a parsed JSON object is held. It exists so that a plain object
 * never reaches the entity classes: they are built from what this hands out, one
 * typed column at a time, and nothing in the app keeps the object afterwards.
 */
export class RawRow {
  private constructor(private readonly values: ReadonlyMap<string, unknown>) {}

  /**
   * Check one raw JSON value against a table's columns, answering the row or null.
   *
   * Strict about every column's type and the `id`, because a row that fails here is
   * not loaded and a half-understood row is worse than a skipped one. Lenient about
   * one thing: a missing `projectId` is read as null, since "no project" is what an
   * absent value would mean. Columns the schema does not name are ignored; the
   * collection keeps the original of any row it rejects, so rejecting never loses
   * data.
   */
  static parse(raw: unknown, columns: readonly Column[]): RawRow | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const candidate = raw as Record<string, unknown>;

    const values = new Map<string, unknown>();
    for (const column of columns) {
      const value =
        column.name === 'projectId' && candidate[column.name] === undefined
          ? null
          : candidate[column.name];
      if (!column.accepts(value)) return null;
      values.set(column.name, value);
    }
    if ((values.get('id') as number) < 1) return null;
    return new RawRow(values);
  }

  int(name: string): number {
    return this.values.get(name) as number;
  }

  number(name: string): number {
    return this.values.get(name) as number;
  }

  string(name: string): string {
    return this.values.get(name) as string;
  }

  nullableString(name: string): string | null {
    return this.values.get(name) as string | null;
  }

  nullableInt(name: string): number | null {
    return this.values.get(name) as number | null;
  }
}
