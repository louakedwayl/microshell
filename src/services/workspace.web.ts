import {
  exampleFiles, joinWorkspacePath, parentPath, sortEntries, utf8ByteLength,
  validateTextContent, validateWorkspacePath, type WorkspaceEntry,
} from '../domain/files';

// The browser preview has its own storage, independent from mobile Documents.
const STORAGE_KEY = 'minishell.web-workspace.v1';
type StoredEntry = { path: string; kind: 'file'; content: string } | { path: string; kind: 'directory' };
type Workspace = { version: 1; entries: StoredEntry[] };

function persist(workspace: Workspace): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    throw new Error('Enregistrement impossible : le stockage du navigateur est indisponible ou plein. Ton brouillon est conservé.');
  }
}

function load(): Workspace {
  let serialized: string | null;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error('Le navigateur refuse l’accès au stockage local.');
  }
  if (serialized === null) {
    const initial: Workspace = {
      version: 1,
      entries: exampleFiles.map((file) => ({ path: file.name, kind: 'file', content: file.content })),
    };
    persist(initial);
    return initial;
  }
  try {
    const data: unknown = JSON.parse(serialized);
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1
      || !('entries' in data) || !Array.isArray(data.entries)) throw new Error();
    const seen = new Set<string>();
    for (const entry of data.entries) {
      if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || !entry.path
        || (entry.kind !== 'file' && entry.kind !== 'directory')) throw new Error();
      validateWorkspacePath(entry.path);
      if (seen.has(entry.path)) throw new Error();
      seen.add(entry.path);
      if (entry.kind === 'file') {
        if (typeof entry.content !== 'string') throw new Error();
        validateTextContent(entry.content);
      }
    }
    const workspace = data as Workspace;
    for (const entry of workspace.entries) {
      const parent = parentPath(entry.path);
      if (parent && !workspace.entries.some((item) => item.path === parent && item.kind === 'directory')) throw new Error();
    }
    return workspace;
  } catch {
    throw new Error('Les fichiers du navigateur sont illisibles. Le stockage existant a été conservé.');
  }
}

function assertDirectory(workspace: Workspace, path: string): void {
  validateWorkspacePath(path);
  if (path && !workspace.entries.some((entry) => entry.path === path && entry.kind === 'directory')) {
    throw new Error('Ce dossier n’existe plus.');
  }
}

export async function initWorkspace(): Promise<void> {
  load();
}

export async function listEntries(path = ''): Promise<WorkspaceEntry[]> {
  const workspace = load();
  assertDirectory(workspace, path);
  return sortEntries(workspace.entries.filter((entry) => parentPath(entry.path) === path).map((entry) => ({
    name: entry.path.split('/').at(-1)!,
    path: entry.path,
    kind: entry.kind,
    ...(entry.kind === 'file' ? { size: utf8ByteLength(entry.content) } : {}),
  })));
}

export async function readTextFile(path: string): Promise<string> {
  validateWorkspacePath(path);
  const entry = load().entries.find((item) => item.path === path);
  if (!entry || entry.kind !== 'file') throw new Error('Ce fichier n’existe plus.');
  return entry.content;
}

export async function writeTextFile(path: string, content: string, previousContent?: string): Promise<void> {
  validateWorkspacePath(path);
  validateTextContent(content);
  const workspace = load();
  const entry = workspace.entries.find((item) => item.path === path);
  if (!entry || entry.kind !== 'file') throw new Error('Ce fichier n’existe plus.');
  if (previousContent !== undefined && entry.content !== previousContent) {
    throw new Error('Ce fichier a changé dans un autre onglet. Ton brouillon est conservé ; copie-le avant de rouvrir le fichier.');
  }
  entry.content = content;
  persist(workspace);
}

async function createEntry(parent: string, name: string, kind: 'file' | 'directory'): Promise<string> {
  const path = joinWorkspacePath(parent, name);
  const workspace = load();
  assertDirectory(workspace, parent);
  if (workspace.entries.some((entry) => entry.path === path)) {
    throw new Error('Un fichier ou un dossier porte déjà ce nom.');
  }
  workspace.entries.push(kind === 'file' ? { path, kind, content: '' } : { path, kind });
  persist(workspace);
  return path;
}

export function createWorkspaceFile(parent: string, name: string): Promise<string> {
  return createEntry(parent, name, 'file');
}

export function createWorkspaceDirectory(parent: string, name: string): Promise<string> {
  return createEntry(parent, name, 'directory');
}
