import { AbstractEntityCollection } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { normalizeCwd } from './normalizeCwd';
import { Project } from './Project.entity';

/**
 * Every working directory the program knows about, and the one place a directory
 * becomes a number.
 *
 * Outside the entity files a project is named by its path: messages, the CLI and
 * the webview all say "this directory". Inside them it is a row of this table, and
 * every other table points at the row. A caller that has a path and needs the
 * number asks {@link ProjectCollection.idOf}; nothing else turns one into the
 * other.
 */
export class ProjectCollection extends AbstractEntityCollection<Project> {
  readonly domain = 'project';
  readonly table = 'projects';
  protected readonly columns = Project.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): Project {
    return Project.fromRow(row);
  }

  /**
   * A project is the top of the ownership chain: it belongs to no other project,
   * and its path is settled into the one spelling every comparison uses.
   */
  protected prepareForWrite(entity: Project): void {
    if (entity.projectId !== null) {
      throw new Error(`a project belongs to no project, but ${entity.path} was given projectId ${entity.projectId}`);
    }
    entity.path = normalizeCwd(entity.path);
  }

  /** The project at [path], or null if the directory has not been seen. */
  async findByPath(path: string): Promise<Project | null> {
    const wanted = normalizeCwd(path);
    return (await this.where((project) => project.path === wanted))[0] ?? null;
  }

  /**
   * The number of the project at [path]. A directory seen for the first time is
   * registered on the spot, so asking is enough to make the program know it.
   *
   * Several processes may ask about a new directory at once; the registration
   * checks for it inside the write, so it is added once.
   */
  async idOf(path: string): Promise<number> {
    const wanted = normalizeCwd(path);
    const known = await this.findByPath(wanted);
    if (known) return known.id;

    const [added] = await this.insertMissing(
      [Project.draft(wanted, Date.now())],
      (stored, candidate) => stored.path === candidate.path,
    );
    if (added) return added.id;

    const raced = await this.findByPath(wanted);
    if (!raced) throw new Error(`project ${wanted} could not be registered`);
    return raced.id;
  }

  /** {@link ProjectCollection.idOf} for a scope that may be no project at all: null stays null. */
  async idOfOrNull(path: string | null): Promise<number | null> {
    return path === null ? null : this.idOf(path);
  }

  /** The directory of project number [id], or null if there is no such project. */
  async pathOf(id: number): Promise<string | null> {
    return (await this.find(id))?.path ?? null;
  }
}
