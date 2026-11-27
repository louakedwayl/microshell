import type { Session, SshCallbacks, SshCredential, SshProfile } from './ssh';

export type { HostKeyInfo, Session, SshCallbacks, SshCredential, SshProfile } from './ssh';

/** Browsers cannot open raw SSH sockets. Previewing the UI never makes a fake connection. */
export async function connectSsh(
  _profile: SshProfile,
  _credential: SshCredential,
  _callbacks: SshCallbacks,
): Promise<Session> {
  throw Object.assign(
    new Error('La connexion SSH est disponible dans l’application iOS et Android. Cet aperçu web présente l’interface uniquement.'),
    { code: 'WEB_UNSUPPORTED' },
  );
}
