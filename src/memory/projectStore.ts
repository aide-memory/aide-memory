import fs from 'fs';
import { FileChunk } from '../core/types';
import { getProjectIndexPath, getProjectDir } from '../storage/paths';
import { ensureDirExists } from '../core/config';

export async function saveProjectIndex(
  projectId: string,
  chunks: FileChunk[]
): Promise<void> {
  const dir = getProjectDir(projectId);
  ensureDirExists(dir);
  const indexPath = getProjectIndexPath(projectId);
  fs.writeFileSync(indexPath, JSON.stringify(chunks), 'utf8');
}

export async function loadProjectIndex(
  projectId: string
): Promise<FileChunk[] | null> {
  const indexPath = getProjectIndexPath(projectId);
  if (!fs.existsSync(indexPath)) return null;
  const raw = fs.readFileSync(indexPath, 'utf8');
  return JSON.parse(raw) as FileChunk[];
}
