export type Profile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
};

export type Credential = { password?: string; privateKey?: string; passphrase?: string };
export type HostIdentity = { host: string; port: number; algorithm: string; fingerprint: string };

export function validateProfile(input: Profile): Profile {
  const name = input.name.trim();
  const host = input.host.trim().replace(/^\[([^\]]+)\]$/, '$1').toLowerCase();
  const username = input.username.trim();
  if (!name || name.length > 64) throw new Error('Donne un nom de 1 à 64 caractères à cette connexion.');
  if (!host || host.length > 253 || /[\s/\\@?#\x00-\x1f]/.test(host) || host.includes('://')) {
    throw new Error('Indique une adresse IP ou un nom de domaine, sans ssh://.');
  }
  if (!username || username.length > 64 || /[\s\x00-\x1f]/.test(username)) {
    throw new Error('Indique un nom d’utilisateur SSH valide.');
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('Le port doit être un nombre entier entre 1 et 65535.');
  }
  if (input.authMethod !== 'password' && input.authMethod !== 'key') throw new Error('Authentification invalide.');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(input.id)) throw new Error('Identifiant de connexion invalide.');
  return { id: input.id, name, host, port: input.port, username, authMethod: input.authMethod };
}

export function compareHostIdentity(known: HostIdentity | null, incoming: HostIdentity): 'new' | 'match' | 'changed' {
  if (!known || known.host !== incoming.host || known.port !== incoming.port) return 'new';
  return known.fingerprint === incoming.fingerprint && known.algorithm === incoming.algorithm ? 'match' : 'changed';
}
