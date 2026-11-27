import assert from 'node:assert/strict';
import test from 'node:test';
import {
  joinWorkspacePath, MAX_TEXT_BYTES, parentPath, sortEntries,
  utf8ByteLength, validateName, validateTextContent, validateUtf8Bytes, validateWorkspacePath,
} from '../src/domain/files';
import * as workspace from '../src/services/workspace.web';

test('workspace paths reject traversal, absolute paths, URI escapes and ambiguous names', () => {
  for (const name of ['', '.', '..', 'a/b', 'a\\b', ' file', 'file ', 'a\u0000b', '%2e%2e', 'x?y', 'x#y']) {
    assert.throws(() => validateName(name), name);
  }
  for (const path of ['/tmp/test', 'src/../secret', 'src//file', './file', 'src/']) {
    assert.throws(() => validateWorkspacePath(path), path);
  }
  assert.equal(validateWorkspacePath(''), '');
  assert.equal(joinWorkspacePath('src', '.zshrc'), 'src/.zshrc');
  assert.equal(parentPath('src/main.py'), 'src');
  assert.equal(parentPath('main.py'), '');
});

test('text size limits count UTF-8 bytes, and binary/malformed UTF-8 is rejected', () => {
  assert.equal(utf8ByteLength('aé🙂'), 7);
  assert.doesNotThrow(() => validateTextContent('a'.repeat(MAX_TEXT_BYTES)));
  assert.throws(() => validateTextContent('é'.repeat(MAX_TEXT_BYTES / 2 + 1)));
  assert.throws(() => validateTextContent('text\u0000binary'));
  validateUtf8Bytes(new TextEncoder().encode('Bonjour 🌍\n'));
  for (const bytes of [[0], [0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82], [0xf4, 0x90, 0x80, 0x80]]) {
    assert.throws(() => validateUtf8Bytes(Uint8Array.from(bytes)));
  }
});

test('folders are listed before files', () => {
  const sorted = sortEntries([
    { name: 'a.py', path: 'a.py', kind: 'file' },
    { name: 'z', path: 'z', kind: 'directory' },
  ]);
  assert.equal(sorted[0]?.kind, 'directory');
});

test('browser workspace preserves files, rejects collisions and prevents stale saves', async () => {
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  try {
    await workspace.initWorkspace();
    assert.ok((await workspace.listEntries()).some((entry) => entry.name === 'hello.py'));
    await workspace.createWorkspaceDirectory('', 'src');
    const path = await workspace.createWorkspaceFile('src', 'main.py');
    await workspace.writeTextFile(path, 'print("Salut")\n', '');
    await workspace.initWorkspace();
    assert.equal(await workspace.readTextFile(path), 'print("Salut")\n');
    await assert.rejects(workspace.createWorkspaceFile('src', 'main.py'), /déjà/);
    await assert.rejects(workspace.createWorkspaceDirectory('src', 'main.py'), /déjà/);
    await assert.rejects(workspace.createWorkspaceFile('../', 'bad.py'));
    await assert.rejects(workspace.writeTextFile(path, 'stale edit', ''), /autre onglet/);
    assert.equal(await workspace.readTextFile(path), 'print("Salut")\n');
    assert.equal((await workspace.listEntries('src')).length, 1);

    const storageKey = [...store.keys()][0]!;
    store.set(storageKey, '{corrupted');
    await assert.rejects(workspace.initWorkspace(), /conservé/);
    assert.equal(store.get(storageKey), '{corrupted');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
