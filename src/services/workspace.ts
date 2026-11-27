import { Directory, File, Paths } from 'expo-file-system';
import {
  exampleFiles, joinWorkspacePath, MAX_TEXT_BYTES, sortEntries,
  validateTextContent, validateUtf8Bytes, validateWorkspacePath,
  type WorkspaceEntry,
} from '../domain/files';

const root = () => new Directory(Paths.document, 'minishell-workspace');
let initialization: Promise<void> | undefined;

export function initWorkspace(): Promise<void> {
  initialization ??= (async () => {
    const directory = root();
    if (directory.exists) return;
    directory.create({ intermediates: true, overwrite: false });
    for (const example of exampleFiles) {
      const file = new File(directory, example.name);
      file.create({ overwrite: false });
      await file.write(example.content);
    }
  })().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

function directoryAt(path: string): Directory {
  validateWorkspacePath(path);
  const directory = path ? new Directory(root(), path) : root();
  if (!directory.exists) throw new Error('Ce dossier n’existe plus.');
  return directory;
}

function fileAt(path: string): File {
  validateWorkspacePath(path);
  if (!path) throw new Error('Sélectionne un fichier.');
  const file = new File(root(), path);
  if (!file.exists) throw new Error('Ce fichier n’existe plus.');
  return file;
}

export async function listEntries(path = ''): Promise<WorkspaceEntry[]> {
  await initWorkspace();
  return sortEntries(directoryAt(path).list().map((entry) => ({
    name: entry.name,
    path: joinWorkspacePath(path, entry.name),
    kind: entry instanceof Directory ? 'directory' : 'file',
    ...(entry instanceof File ? { size: entry.size } : {}),
  })));
}

export async function readTextFile(path: string): Promise<string> {
  await initWorkspace();
  const file = fileAt(path);
  if (file.size > MAX_TEXT_BYTES) throw new Error('L’éditeur accepte des fichiers texte de 512 Ko maximum.');
  validateUtf8Bytes(await file.bytes());
  const content = await file.text();
  validateTextContent(content);
  return content;
}

export async function writeTextFile(path: string, content: string, previousContent?: string): Promise<void> {
  validateTextContent(content);
  await initWorkspace();
  const file = fileAt(path);
  if (previousContent !== undefined && await readTextFile(path) !== previousContent) {
    throw new Error('Ce fichier a changé depuis son ouverture. Ton brouillon est conservé ; copie-le avant de rouvrir le fichier.');
  }
  await file.write(content);
}

function unusedPath(parent: string, name: string): string {
  const path = joinWorkspacePath(parent, name);
  if (directoryAt(parent).list().some((entry) => entry.name === name)) {
    throw new Error('Un fichier ou un dossier porte déjà ce nom.');
  }
  return path;
}

export async function createWorkspaceFile(parent: string, name: string): Promise<string> {
  await initWorkspace();
  const path = unusedPath(parent, name);
  new File(root(), path).create({ overwrite: false });
  return path;
}

export async function createWorkspaceDirectory(parent: string, name: string): Promise<string> {
  await initWorkspace();
  const path = unusedPath(parent, name);
  new Directory(root(), path).create({ overwrite: false });
  return path;
}
