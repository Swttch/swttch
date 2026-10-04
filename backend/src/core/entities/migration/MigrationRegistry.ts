import type { Migration } from './Migration';

/** One migration: the name it is recorded under, and a way to make it. */
export class MigrationEntry {
  constructor(
    /** The file's name without its extension, e.g. `20261004120000_create-projects`. */
    readonly name: string,
    private readonly make: () => Migration,
  ) {}

  create(): Migration {
    return this.make();
  }
}

const NAME_PATTERN = /^\d{14}_[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The migrations of this version of the program, in the order they run.
 *
 * The list is written out in a file that imports every migration, because the
 * backend is one bundle and a folder cannot be read at run time to find them. The
 * names are checked here: each has the shape `<14-digit timestamp>_<kebab-name>`,
 * none repeats, and they are in the order of their timestamps, since that order is
 * the one they run in. A test checks the list against the folder, so a migration
 * file that is not listed fails the build rather than never running.
 */
export class MigrationRegistry {
  readonly entries: readonly MigrationEntry[];

  constructor(entries: MigrationEntry[]) {
    entries.forEach((entry, index) => {
      if (!NAME_PATTERN.test(entry.name)) {
        throw new Error(`migration name "${entry.name}" is not <14-digit timestamp>_<kebab-name>`);
      }
      const previous = entries[index - 1];
      if (previous !== undefined && previous.name >= entry.name) {
        throw new Error(`migration "${entry.name}" is not after "${previous.name}": names must be unique and in timestamp order`);
      }
    });
    this.entries = entries;
  }

  /** The migrations whose names are not in [recorded], in the order they run. */
  pendingAgainst(recorded: ReadonlySet<string>): MigrationEntry[] {
    return this.entries.filter((entry) => !recorded.has(entry.name));
  }

  /** The names in [recorded] that this version does not have: what a newer version ran. */
  unknownIn(recorded: ReadonlySet<string>): string[] {
    const known = new Set(this.entries.map((entry) => entry.name));
    return [...recorded].filter((name) => !known.has(name)).sort();
  }
}
