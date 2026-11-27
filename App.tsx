import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts } from './src/theme';
import { compareHostIdentity, type HostIdentity, type Profile } from './src/domain/profiles';
import {
  credentialIsRemembered, loadCredential, loadHostIdentity, loadProfiles,
  removeCredential, storeCredential, storeHostIdentity, storeProfiles,
} from './src/services/profiles';
import { connectSsh, type Session } from './src/services/ssh';
import { FilesScreen } from './src/components/FilesScreen';

type Tab = 'terminal' | 'files' | 'servers';

const initialTerminal = [
  { kind: 'system', text: 'minishell 0.1 — terminal SSH sécurisé' },
  { kind: 'muted', text: 'Ajoute un VPS pour commencer. Aucun shell local simulé.' },
  { kind: 'prompt', text: 'minishell > ' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('terminal');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [lines, setLines] = useState(initialTerminal);
  const [command, setCommand] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { loadProfiles().then(setProfiles).catch((e) => setNotice(e.message)); }, []);
  useEffect(() => () => { session?.close(); }, [session]);

  const title = useMemo(() => tab === 'terminal' ? 'Terminal' : tab === 'files' ? 'Fichiers' : 'VPS', [tab]);

  function append(kind: string, text: string) { setLines((old) => [...old.slice(-250), { kind, text }]); }

  async function openProfile(profile: Profile, credentialOverride?: { password?: string; privateKey?: string; passphrase?: string }) {
    const credential = credentialOverride ?? await loadCredential(profile.id);
    if (!credential) { setNotice('Identifiants absents. Ouvre ce VPS et renseigne ton accès.'); setTab('servers'); return; }
    setNotice('Connexion…');
    try {
      const next = await connectSsh(profile, credential, {
        onData: (data) => append('output', data),
        onClose: () => { setSession(null); append('muted', '\n[connexion fermée]'); },
        verifyHostKey: async (incoming) => {
          const known = await loadHostIdentity(profile.id);
          const state = compareHostIdentity(known, incoming);
          if (state === 'match') return true;
          const message = state === 'changed'
            ? `La clé du VPS a changé.\n\n${incoming.algorithm}\n${incoming.fingerprint}\n\nRefuse si tu n’as pas vérifié ce changement.`
            : `Première connexion à ${incoming.host}:${incoming.port}.\n\n${incoming.algorithm}\n${incoming.fingerprint}`;
          return await new Promise<boolean>((resolve) => Alert.alert('Vérifier la clé du VPS', message, [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Approuver', onPress: async () => { await storeHostIdentity(profile.id, incoming); resolve(true); } },
          ]));
        },
      });
      setSession(next); setActiveProfile(profile); setTab('terminal'); setNotice(null);
      append('system', `Connecté à ${profile.username}@${profile.host}:${profile.port}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Connexion impossible.'); }
  }

  async function sendCommand() {
    const value = command;
    if (!value.trim()) return;
    append('input', `${activeProfile ? `${activeProfile.username}@${activeProfile.host}` : 'minishell'} $ ${value}`);
    setCommand('');
    if (!session) { append('muted', 'Connecte un VPS avant d’exécuter une commande.'); return; }
    try { session.write(`${value}\n`); } catch (error) { setNotice(error instanceof Error ? error.message : 'Commande impossible.'); }
  }

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <View style={styles.header}><View><Text style={styles.brand}>minishell</Text><Text style={styles.subtitle}>{title}</Text></View><View style={[styles.dot, session && styles.dotOn]} /></View>
    {notice && <Pressable style={styles.notice} onPress={() => setNotice(null)}><Text style={styles.noticeText}>{notice}</Text></Pressable>}
    {tab === 'terminal' && <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.terminal} contentContainerStyle={styles.terminalContent} keyboardShouldPersistTaps="handled">
        {lines.map((line, index) => <Text key={`${index}-${line.text}`} style={[styles.mono, line.kind === 'system' && styles.system, line.kind === 'muted' && styles.muted, line.kind === 'input' && styles.input, line.kind === 'prompt' && styles.prompt]}>{line.text}</Text>)}
      </ScrollView>
      <View style={styles.commandRow}><Text style={styles.promptSign}>$</Text><TextInput value={command} onChangeText={setCommand} onSubmitEditing={sendCommand} placeholder="commande SSH" placeholderTextColor={colors.subtle} style={styles.command} autoCapitalize="none" autoCorrect={false} editable={Boolean(session)} /><Pressable onPress={sendCommand} style={styles.send}><Text style={styles.sendText}>↵</Text></Pressable></View>
    </KeyboardAvoidingView>}
    <View style={[styles.flex, tab !== 'files' && styles.hidden]}><FilesScreen active={tab === 'files'} onNotice={setNotice} /></View>
    {tab === 'servers' && <ServersScreen profiles={profiles} activeId={activeProfile?.id} onAdd={() => setShowAdd(true)} onConnect={openProfile} onDelete={async (profile) => { await storeProfiles(profiles.filter((item) => item.id !== profile.id)); await removeCredential(profile.id); setProfiles((old) => old.filter((item) => item.id !== profile.id)); }} />}
    <View style={styles.nav}>{([['terminal', '⌁', 'Terminal'], ['files', '□', 'Fichiers'], ['servers', '⌂', 'VPS']] as const).map(([value, icon, label]) => <Pressable key={value} onPress={() => setTab(value)} style={styles.navItem}><Text style={[styles.navIcon, tab === value && styles.navActive]}>{icon}</Text><Text style={[styles.navLabel, tab === value && styles.navActive]}>{label}</Text></Pressable>)}</View>
    <AddServerModal visible={showAdd} onClose={() => setShowAdd(false)} onSave={async (profile, credential, remember) => { const next = [...profiles, profile]; await storeProfiles(next); await storeCredential(profile.id, credential, remember); setProfiles(next); setShowAdd(false); await openProfile(profile, credential); }} />
  </SafeAreaView>;
}

function ServersScreen({ profiles, activeId, onAdd, onConnect, onDelete }: { profiles: Profile[]; activeId?: string; onAdd: () => void; onConnect: (profile: Profile) => void; onDelete: (profile: Profile) => void }) {
  return <ScrollView style={styles.flex} contentContainerStyle={styles.serverContent}><View style={styles.serverIntro}><Text style={styles.sectionTitle}>Tes VPS</Text><Text style={styles.muted}>Les clés et mots de passe restent dans le stockage sécurisé du téléphone.</Text></View>{profiles.map((profile) => <View key={profile.id} style={styles.serverCard}><View style={styles.serverTop}><View><Text style={styles.serverName}>{profile.name}</Text><Text style={styles.serverAddress}>{profile.username}@{profile.host}:{profile.port}</Text></View>{activeId === profile.id && <Text style={styles.connected}>connecté</Text>}</View><View style={styles.serverActions}><Pressable style={styles.primaryButton} onPress={() => onConnect(profile)}><Text style={styles.primaryText}>Connecter</Text></Pressable><Pressable style={styles.deleteButton} onPress={() => onDelete(profile)}><Text style={styles.deleteText}>Supprimer</Text></Pressable></View></View>)}<Pressable style={styles.addButton} onPress={onAdd}><Text style={styles.addText}>＋ Ajouter un VPS</Text></Pressable></ScrollView>;
}

function AddServerModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (profile: Profile, credential: { password?: string; privateKey?: string; passphrase?: string }, remember: boolean) => void }) {
  const [name, setName] = useState(''); const [host, setHost] = useState(''); const [username, setUsername] = useState('root'); const [port, setPort] = useState('22'); const [secret, setSecret] = useState(''); const [method, setMethod] = useState<'password' | 'key'>('password'); const [remember, setRemember] = useState(true);
  function save() { const profile: Profile = { id: `vps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, host, port: Number(port), username, authMethod: method }; try { onSave(profile, method === 'password' ? { password: secret } : { privateKey: secret }, remember); } catch (e) { Alert.alert('Vérifie les champs', e instanceof Error ? e.message : 'Configuration invalide.'); } }
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.modal}><View style={styles.modalHeader}><Text style={styles.sectionTitle}>Ajouter un VPS</Text><Pressable onPress={onClose}><Text style={styles.cancel}>Fermer</Text></Pressable></View><ScrollView contentContainerStyle={styles.form}><Field label="Nom" value={name} onChangeText={setName} placeholder="Mon serveur" /><Field label="Adresse IP ou domaine" value={host} onChangeText={setHost} placeholder="vps.example.com" autoCapitalize="none" /><View style={styles.fieldRow}><View style={styles.fieldHalf}><Field label="Utilisateur" value={username} onChangeText={setUsername} autoCapitalize="none" /></View><View style={styles.fieldSmall}><Field label="Port" value={port} onChangeText={setPort} keyboardType="number-pad" /></View></View><Text style={styles.label}>Authentification</Text><View style={styles.segment}><Pressable onPress={() => setMethod('password')} style={[styles.segmentButton, method === 'password' && styles.segmentSelected]}><Text style={styles.segmentText}>Mot de passe</Text></Pressable><Pressable onPress={() => setMethod('key')} style={[styles.segmentButton, method === 'key' && styles.segmentSelected]}><Text style={styles.segmentText}>Clé privée</Text></Pressable></View><Field label={method === 'password' ? 'Mot de passe' : 'Clé privée OpenSSH'} value={secret} onChangeText={setSecret} secureTextEntry={method === 'password'} multiline={method === 'key'} autoCapitalize="none" /><Pressable onPress={() => setRemember(!remember)} style={styles.remember}><Text style={styles.check}>{remember ? '✓' : '○'}</Text><Text style={styles.muted}>Mémoriser dans le stockage sécurisé</Text></Pressable><Pressable style={styles.saveButton} onPress={save}><Text style={styles.saveText}>Enregistrer et connecter</Text></Pressable></ScrollView></SafeAreaView></Modal>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, ...input } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} placeholderTextColor={colors.subtle} style={[styles.textInput, props.multiline && styles.multiline]} /></View>; }

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, hidden: { display: 'none' }, header: { height: 76, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border }, brand: { color: colors.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.4 }, subtitle: { color: colors.muted, marginTop: 4, fontSize: 12 }, dot: { width: 9, height: 9, borderRadius: 9, backgroundColor: colors.border }, dotOn: { backgroundColor: colors.accent }, notice: { backgroundColor: colors.accentDim, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.accent }, noticeText: { color: colors.accent, fontSize: 12, lineHeight: 18 }, terminal: { flex: 1, backgroundColor: '#080a0c' }, terminalContent: { padding: 18, gap: 8 }, mono: { fontFamily: fonts.mono, color: colors.text, fontSize: 13, lineHeight: 20 }, system: { color: colors.accent }, muted: { color: colors.muted }, input: { color: '#d0e7ad' }, prompt: { color: colors.subtle }, commandRow: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }, promptSign: { color: colors.accent, fontFamily: fonts.mono, fontSize: 18, marginRight: 10 }, command: { flex: 1, color: colors.text, fontFamily: fonts.mono, fontSize: 14, minHeight: 44 }, send: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, sendText: { color: '#0b0e11', fontWeight: '800', fontSize: 20 }, nav: { height: 70, flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: Platform.OS === 'ios' ? 10 : 0 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }, navIcon: { color: colors.subtle, fontSize: 20 }, navLabel: { color: colors.subtle, fontSize: 11 }, navActive: { color: colors.accent }, serverContent: { padding: 20, gap: 14 }, serverIntro: { marginBottom: 8 }, sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '700' }, serverCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 15, gap: 15 }, serverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, serverName: { color: colors.text, fontWeight: '700', fontSize: 16 }, serverAddress: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12, marginTop: 5 }, connected: { color: colors.accent, fontSize: 11 }, serverActions: { flexDirection: 'row', gap: 10 }, primaryButton: { backgroundColor: colors.accent, borderRadius: 7, paddingVertical: 9, paddingHorizontal: 13 }, primaryText: { color: '#0b0e11', fontWeight: '700', fontSize: 12 }, deleteButton: { borderColor: colors.border, borderWidth: 1, borderRadius: 7, paddingVertical: 8, paddingHorizontal: 12 }, deleteText: { color: colors.danger, fontSize: 12 }, addButton: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 2 }, addText: { color: colors.accent, fontWeight: '700' }, modal: { flex: 1, backgroundColor: colors.background }, modalHeader: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }, cancel: { color: colors.accent }, form: { padding: 20, gap: 4 }, field: { marginBottom: 15 }, label: { color: colors.muted, fontSize: 12, marginBottom: 7 }, textInput: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 }, multiline: { minHeight: 130, textAlignVertical: 'top', fontFamily: fonts.mono }, fieldRow: { flexDirection: 'row', gap: 10 }, fieldHalf: { flex: 1 }, fieldSmall: { width: 90 }, segment: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', marginBottom: 15 }, segmentButton: { flex: 1, padding: 11, alignItems: 'center' }, segmentSelected: { backgroundColor: colors.elevated }, segmentText: { color: colors.text, fontSize: 12 }, remember: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 9 }, check: { color: colors.accent, fontSize: 20 }, saveButton: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 18 }, saveText: { color: '#0b0e11', fontWeight: '800' } });
