import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Credential, HostIdentity, Profile, validateProfile } from '../domain/profiles';

const PROFILES_KEY = 'minishell.profiles.v1';
const credentials = new Map<string, Credential>();
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function loadProfiles(): Promise<Profile[]> {
  const value = await AsyncStorage.getItem(PROFILES_KEY);
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Le fichier des connexions est illisible. Il a été conservé.');
  return parsed.map((item) => validateProfile(item));
}

export async function storeProfiles(profiles: Profile[]): Promise<void> {
  // Serialize only metadata, never passwords or private keys.
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.map(validateProfile)));
}

export async function storeCredential(id: string, credential: Credential, remember: boolean): Promise<void> {
  if (Platform.OS !== 'web') {
    if (remember) await SecureStore.setItemAsync(`minishell.secret.${id}`, JSON.stringify(credential), secureOptions);
    else await SecureStore.deleteItemAsync(`minishell.secret.${id}`);
  }
  credentials.set(id, credential);
}

export async function loadCredential(id: string): Promise<Credential | null> {
  const inMemory = credentials.get(id);
  if (inMemory) return inMemory;
  if (Platform.OS === 'web') return null;
  const value = await SecureStore.getItemAsync(`minishell.secret.${id}`);
  return value ? JSON.parse(value) as Credential : null;
}

export async function credentialIsRemembered(id: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return Boolean(await SecureStore.getItemAsync(`minishell.secret.${id}`));
}

export async function removeCredential(id: string): Promise<void> {
  credentials.delete(id);
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(`minishell.secret.${id}`);
}

export async function loadHostIdentity(id: string): Promise<HostIdentity | null> {
  if (Platform.OS === 'web') return null;
  const value = await SecureStore.getItemAsync(`minishell.host.${id}`);
  return value ? JSON.parse(value) as HostIdentity : null;
}

export async function storeHostIdentity(id: string, identity: HostIdentity): Promise<void> {
  if (Platform.OS === 'web') throw new Error('La connexion SSH nécessite l’application iOS ou Android.');
  await SecureStore.setItemAsync(`minishell.host.${id}`, JSON.stringify(identity), secureOptions);
}

export async function forgetHostIdentity(id: string): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(`minishell.host.${id}`);
}
