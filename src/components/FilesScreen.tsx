import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, BackHandler, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { parentPath, type WorkspaceEntry } from '../domain/files';
import {
  createWorkspaceDirectory, createWorkspaceFile, listEntries, readTextFile, writeTextFile,
} from '../services/workspace';
import { colors, fonts } from '../theme';

type Props = { onNotice?: (message: string) => void; active?: boolean };
type OpenFile = { path: string; original: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Impossible d’accéder aux fichiers. Réessaie.';
}

function sizeLabel(size?: number): string {
  if (size === undefined) return 'dossier';
  return size < 1024 ? `${size} o` : `${Math.ceil(size / 1024)} Ko`;
}

export function FilesScreen({ onNotice, active = true }: Props) {
  const [folder, setFolder] = useState('');
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [file, setFile] = useState<OpenFile | null>(null);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createKind, setCreateKind] = useState<'file' | 'directory' | null>(null);
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = file !== null && content !== file.original;

  const reload = useCallback(async (path: string) => {
    const next = await listEntries(path);
    setEntries(next);
    setFolder(path);
  }, []);

  useEffect(() => {
    let mounted = true;
    listEntries().then((next) => { if (mounted) setEntries(next); })
      .catch((reason: unknown) => { if (mounted) setError(errorMessage(reason)); })
      .finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, []);

  const closeFile = useCallback(() => {
    setFile(null);
    setContent('');
    setConfirmDiscard(false);
    setError('');
    setNotice('');
  }, []);

  const goBack = useCallback(() => {
    if (busy) return;
    if (file) {
      if (dirty) setConfirmDiscard(true);
      else closeFile();
    } else if (folder) {
      setBusy(true);
      setError('');
      void reload(parentPath(folder)).catch((reason: unknown) => setError(errorMessage(reason)))
        .finally(() => setBusy(false));
    }
  }, [busy, file, dirty, closeFile, folder, reload]);

  useEffect(() => {
    if (!active || Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!file && !folder) return false;
      goBack();
      return true;
    });
    return () => handler.remove();
  }, [active, file, folder, goBack]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty) return;
    const preventClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, [dirty]);

  const openEntry = async (entry: WorkspaceEntry) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (entry.kind === 'directory') await reload(entry.path);
      else {
        const text = await readTextFile(entry.path);
        setContent(text);
        setFile({ path: entry.path, original: text });
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await writeTextFile(file.path, content, file.original);
      setFile({ path: file.path, original: content });
      setNotice('Fichier enregistré.');
      onNotice?.('Fichier enregistré.');
      await reload(folder);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!createKind || busy) return;
    setBusy(true);
    setCreateError('');
    try {
      if (createKind === 'file') {
        const path = await createWorkspaceFile(folder, name);
        setFile({ path, original: '' });
        setContent('');
      } else {
        await createWorkspaceDirectory(folder, name);
      }
      setCreateKind(null);
      setError('');
      setNotice('');
      await reload(folder);
    } catch (reason) {
      setCreateError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>ESPACE LOCAL</Text>
          <Text style={styles.title}>{file ? 'Éditeur' : 'Fichiers de l’app'}</Text>
        </View>
        {busy && <ActivityIndicator color={colors.accent} accessibilityLabel="Chargement" />}
        {!file && (
          <Pressable accessibilityRole="button" accessibilityLabel="Actualiser les fichiers" disabled={busy}
            onPress={() => {
              setBusy(true);
              setError('');
              void reload(folder).catch((reason: unknown) => setError(errorMessage(reason))).finally(() => setBusy(false));
            }} style={styles.smallButton}>
            <Text style={styles.buttonText}>↻</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.pathBar}>
        {(file || folder) && (
          <Pressable accessibilityRole="button" accessibilityLabel={file ? 'Fermer le fichier' : 'Dossier parent'}
            style={styles.backButton} onPress={goBack} disabled={busy}>
            <Text style={styles.accentText}>←</Text>
          </Pressable>
        )}
        <Text style={styles.pathText} numberOfLines={1} ellipsizeMode="middle">/{file?.path ?? folder}</Text>
        {file && (
          <Pressable accessibilityRole="button" onPress={() => void save()} disabled={busy || !dirty}
            style={[styles.saveButton, (!dirty || busy) && styles.disabled]}>
            <Text style={styles.saveText}>Enregistrer</Text>
          </Pressable>
        )}
      </View>

      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}

      {file ? (
        <>
          <TextInput accessibilityLabel={`Code du fichier ${file.path}`} style={styles.editor}
            value={content} onChangeText={(text) => { setContent(text); setNotice(''); }}
            multiline editable={!busy} autoCapitalize="none" autoCorrect={false}
            spellCheck={false} textAlignVertical="top" selectionColor={colors.accent}
            placeholder="Écris ton code ici…" placeholderTextColor={colors.subtle}
            keyboardAppearance="dark" scrollEnabled />
          <View style={styles.editorFooter}>
            <Text style={styles.meta}>UTF-8 · {content.split('\n').length} lignes</Text>
            <Text style={[styles.meta, dirty && styles.unsaved]}>{dirty ? 'Non enregistré' : 'Enregistré'}</Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.explanation}>
            {Platform.OS === 'web'
              ? 'Aperçu web · fichiers conservés dans ce navigateur.'
              : 'Tes fichiers, conservés sur ce téléphone.'}
            {'\n'}Cet espace est indépendant de ton VPS.
          </Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
              onPress={() => { setName(''); setCreateError(''); setCreateKind('file'); }}>
              <Text style={styles.actionText}>+ Fichier</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
              onPress={() => { setName(''); setCreateError(''); setCreateKind('directory'); }}>
              <Text style={styles.actionText}>+ Dossier</Text>
            </Pressable>
          </View>
          <FlatList data={entries} keyExtractor={(entry) => entry.path} style={styles.list}
            contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled"
            ListEmptyComponent={!busy ? <Text style={styles.empty}>Ce dossier est vide. Crée ton premier fichier.</Text> : undefined}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`${item.kind === 'directory' ? 'Ouvrir le dossier' : 'Modifier le fichier'} ${item.name}`}
                disabled={busy} onPress={() => void openEntry(item)} style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
                <View style={[styles.fileBadge, item.kind === 'directory' && styles.folderBadge]}>
                  <Text style={[styles.fileBadgeText, item.kind === 'directory' && styles.accentText]}>{item.kind === 'directory' ? 'DIR' : '</>'}</Text>
                </View>
                <View style={styles.entryCopy}>
                  <Text numberOfLines={1} style={styles.fileName}>{item.name}</Text>
                  <Text style={styles.meta}>{sizeLabel(item.size)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )} />
          <Text style={styles.bottomHint}>Texte UTF-8 · jusqu’à 512 Ko par fichier</Text>
        </>
      )}

      <Modal visible={active && createKind !== null} transparent animationType="fade"
        onRequestClose={() => { if (!busy) setCreateKind(null); }}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text style={styles.dialogTitle}>{createKind === 'directory' ? 'Nouveau dossier' : 'Nouveau fichier'}</Text>
            <Text style={styles.dialogHelp}>Dans /{folder}</Text>
            <TextInput accessibilityLabel={createKind === 'directory' ? 'Nom du dossier' : 'Nom du fichier'}
              autoFocus value={name} onChangeText={setName} editable={!busy} autoCapitalize="none" autoCorrect={false}
              placeholder={createKind === 'directory' ? 'mon-projet' : 'main.py'} placeholderTextColor={colors.subtle}
              style={styles.nameInput} selectionColor={colors.accent} keyboardAppearance="dark"
              onSubmitEditing={() => void create()} returnKeyType="done" />
            {!!createError && <Text accessibilityRole="alert" style={styles.dialogError}>{createError}</Text>}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" style={styles.dialogButton} disabled={busy} onPress={() => setCreateKind(null)}>
                <Text style={styles.buttonText}>Annuler</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={[styles.saveButton, (busy || !name) && styles.disabled]}
                disabled={busy || !name} onPress={() => void create()}>
                <Text style={styles.saveText}>{busy ? 'Création…' : 'Créer'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={active && confirmDiscard} transparent animationType="fade" onRequestClose={() => setConfirmDiscard(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text style={styles.dialogTitle}>Modifications non enregistrées</Text>
            <Text style={styles.dialogHelp}>Ton fichier contient un brouillon. Reviens à l’éditeur pour l’enregistrer, ou abandonne ces modifications.</Text>
            <Pressable accessibilityRole="button" style={styles.returnButton} onPress={() => setConfirmDiscard(false)}>
              <Text style={styles.saveText}>Continuer à modifier</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.dialogButton} onPress={closeFile}>
              <Text style={styles.discardText}>Abandonner les modifications</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  heading: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.accent, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  title: { color: colors.text, fontSize: 25, fontWeight: '600', letterSpacing: -0.6 },
  smallButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  buttonText: { color: colors.text, fontFamily: fonts.mono, fontSize: 14 },
  pathBar: { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', minHeight: 54, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 16, gap: 10 },
  backButton: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  accentText: { color: colors.accent, fontFamily: fonts.mono, fontSize: 17 },
  pathText: { flex: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 13 },
  saveButton: { minHeight: 38, paddingHorizontal: 14, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  saveText: { color: colors.background, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.4 },
  error: { color: colors.danger, padding: 16, fontSize: 13, lineHeight: 20, backgroundColor: colors.surface },
  notice: { color: colors.accent, padding: 12, fontSize: 12, backgroundColor: colors.surface },
  explanation: { color: colors.muted, lineHeight: 21, fontSize: 12, paddingHorizontal: 22, paddingTop: 20 },
  actions: { flexDirection: 'row', paddingHorizontal: 22, paddingVertical: 18, gap: 10 },
  action: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 16, minHeight: 42, justifyContent: 'center' },
  actionText: { color: colors.text, fontFamily: fonts.mono, fontSize: 12 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 22, paddingBottom: 20 },
  entry: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surface },
  fileBadge: { height: 40, width: 40, borderRadius: 10, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  folderBadge: { backgroundColor: colors.accentDim },
  fileBadgeText: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  entryCopy: { flex: 1, gap: 5 },
  fileName: { color: colors.text, fontFamily: fonts.mono, fontSize: 14 },
  meta: { color: colors.subtle, fontFamily: fonts.mono, fontSize: 11 },
  chevron: { color: colors.subtle, fontSize: 24 },
  empty: { color: colors.muted, lineHeight: 23, paddingVertical: 30, fontSize: 14 },
  bottomHint: { color: colors.subtle, fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', padding: 15 },
  editor: { flex: 1, paddingHorizontal: 20, paddingVertical: 20, fontFamily: fonts.mono, fontSize: 14, lineHeight: 23, color: colors.text, backgroundColor: colors.background },
  editorFooter: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderTopWidth: 1, borderColor: colors.border, gap: 10 },
  unsaved: { color: colors.warning },
  overlay: { flex: 1, backgroundColor: '#000000b3', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 24 },
  dialogTitle: { fontSize: 19, color: colors.text, fontWeight: '600', marginBottom: 10 },
  dialogHelp: { color: colors.muted, fontSize: 13, lineHeight: 21, marginBottom: 18 },
  nameInput: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 9, padding: 14, color: colors.text, fontFamily: fonts.mono, fontSize: 15 },
  dialogError: { color: colors.danger, fontSize: 12, lineHeight: 19, marginTop: 12 },
  dialogActions: { marginTop: 20, flexDirection: 'row', justifyContent: 'flex-end', gap: 14 },
  dialogButton: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  returnButton: { minHeight: 44, backgroundColor: colors.accent, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  discardText: { color: colors.danger, fontSize: 12, textAlign: 'center' },
});
