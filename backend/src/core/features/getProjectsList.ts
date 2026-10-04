import { stat } from 'fs/promises';
import { workingDirName } from '../../shared';
import { ProjectCollection } from '../entities/project/Project.collection';
import type { Project } from '../entities/project/Project.entity';

/**
 * One project in the list the project picker shows, in the shape the webview has
 * always received. The times are ISO strings here and epoch milliseconds in the
 * entity file.
 */
export class ProjectListEntry {
  constructor(
    /** The folder's name, which is what the project is called unless the user gave it an alias. */
    readonly name: string,
    /** The working directory. */
    readonly path: string,
    readonly sessionCount: number,
    /** Most recent activity: the newest session's last write. Drives "recent" order. */
    readonly lastModified: string,
    /** Earliest known session for this project. Drives "created" order (#392). */
    readonly createdAt: string,
  ) {}

  static of(project: Project): ProjectListEntry {
    return new ProjectListEntry(
      workingDirName(project.path),
      project.path,
      project.sessionCount,
      new Date(project.lastModified).toISOString(),
      new Date(project.createdAt).toISOString(),
    );
  }
}

/**
 * The projects the program knows about, newest activity first, read from the
 * `projects` table without looking at the CLI's records. {@link syncProjectsList}
 * is what brings the table up to date with them; this is for callers that can live
 * with the list as it was last brought up to date.
 *
 * Two kinds of project are left out. One is a project the user removed from the
 * list. The other is a directory with no session that is no longer on disk: it was
 * registered because something once asked about it, and there is nothing left to
 * open.
 */
export async function getProjectsList(): Promise<ProjectListEntry[]> {
  const projects = await new ProjectCollection().all();

  const listed: Project[] = [];
  for (const project of projects) {
    if (project.isHidden) continue;
    if (project.sessionCount === 0 && !(await isDirectory(project.path))) continue;
    listed.push(project);
  }

  listed.sort((a, b) => b.lastModified - a.lastModified);
  return listed.map((project) => ProjectListEntry.of(project));
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
