export const MAX_TEXT_BYTES = 512 * 1024;

export type WorkspaceEntry = {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
};

export function validateName(name: string): string {
  if (!name || name.trim() !== name || name === '.' || name === '..') {
    throw new Error('Choisis un nom sans espaces au début ou à la fin.');
  }
  if (name.length > 120 || /[\\/\u0000-\u001f\u007f:%?#]/u.test(name)) {
    throw new Error('Nom invalide : 120 caractères maximum, sans /, \\, :, %, ?, # ni caractères de contrôle.');
  }
  return name;
}

/** An empty path is the workspace root; all other paths are relative. */
export function validateWorkspacePath(path: string): string {
  if (path === '') return path;
  if (path.length > 1024) throw new Error('Ce chemin est trop long.');
  path.split('/').forEach(validateName);
  return path;
}

export function joinWorkspacePath(parent: string, name: string): string {
  validateWorkspacePath(parent);
  validateName(name);
  return validateWorkspacePath(parent ? `${parent}/${name}` : name);
}

export function parentPath(path: string): string {
  validateWorkspacePath(path);
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function utf8ByteLength(text: string): number {
  let length = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return length;
}

export function validateTextContent(text: string): void {
  if (utf8ByteLength(text) > MAX_TEXT_BYTES) {
    throw new Error('L’éditeur accepte des fichiers texte de 512 Ko maximum.');
  }
  if (text.includes('\u0000')) {
    throw new Error('Ce fichier semble binaire. Ouvre un fichier texte UTF-8.');
  }
}

/** Reject malformed UTF-8 before a native decoder can replace bytes silently. */
export function validateUtf8Bytes(bytes: Uint8Array): void {
  if (bytes.length > MAX_TEXT_BYTES) {
    throw new Error('L’éditeur accepte des fichiers texte de 512 Ko maximum.');
  }
  const invalid = () => {
    throw new Error('Ce fichier n’est pas un texte UTF-8 valide.');
  };
  for (let index = 0; index < bytes.length; index++) {
    const first = bytes[index]!;
    if (first <= 0x7f) {
      if (first === 0) invalid();
      continue;
    }
    const count = first >= 0xc2 && first <= 0xdf ? 1
      : first >= 0xe0 && first <= 0xef ? 2
      : first >= 0xf0 && first <= 0xf4 ? 3 : -1;
    if (count < 0 || index + count >= bytes.length) invalid();
    const second = bytes[index + 1]!;
    if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second >= 0xa0)
      || (first === 0xf0 && second < 0x90) || (first === 0xf4 && second >= 0x90)) invalid();
    for (let offset = 1; offset <= count; offset++) {
      const next = bytes[index + offset]!;
      if (next < 0x80 || next > 0xbf) invalid();
    }
    index += count;
  }
}

export function sortEntries(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export const exampleFiles = [
  {
    name: 'LISEZMOI.md',
    content: '# Bienvenue dans minishell\n\nCes exemples sont des fichiers locaux à l’app.\nOuvre un fichier pour le modifier, puis touche Enregistrer.\n\nCet espace est indépendant de ton VPS et du futur environnement Linux local.\nLes fichiers ne sont pas transférés automatiquement en SSH.\n',
  },
  {
    name: 'hello.py',
    content: '# Exemple Python : tu peux modifier ce fichier dans l’éditeur.\n# Son exécution nécessite un environnement Python.\n\nprint("Salut depuis minishell !")\n',
  },
] as const;
